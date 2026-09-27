import type { SessionOptions, IronSession } from "iron-session";
import { getIronSession as getIronSessionRaw } from "iron-session";
import type { cookies as nextCookies } from "next/headers";
import { pool } from "@/lib/db";
import {
  sessionSurvivesVerification,
  pickFreshRevokedAt,
  type RevokedAtEntry,
} from "@/lib/sessionVerify";

export type SessionUser = {
  id: number;
  username: string;
  role?: string | null;
  discordId?: string | null;
  /**
   * v1 "sign out everywhere": unix seconds this credential was minted
   * (written by /api/auth/login — iron-session v8 does NOT expose the seal's
   * createdAt to us, proven in node_modules/iron-session/dist: no reference
   * to it, so we stamp our own). Absent on legacy cookies => treated as
   * pre-revocation, which is correct: those predate any cutoff you can set.
   */
  loginAt?: number;
  /**
   * v1 grace token: the revocation cutoff second this very device re-signed
   * itself with (see /api/account/revoke-sessions). Legacy cookies lack it.
   */
  revokets?: number;
};

export type SessionData = {
  user?: SessionUser;
};

function requireSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters long."
    );
  }

  return secret;
}

export const sessionOptions: SessionOptions = {
  cookieName: "mcwv_session",
  password: requireSessionSecret(),
  ttl: 60 * 60 * 24 * 14, // 14 days
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

/* ------------------------------------------------------------------ */
/* v1: deny-existence companion — "sign out everywhere" enforcement. */
/*                                                                   */
/* ONE choke point for the whole app: every route already branches on */
/* `session.user?.id`, so clearing `user` here when the cookie        */
/* predates a per-user revocation cutoff makes every consumer 401    */
/* naturally — no per-route logic changed anywhere.                  */
/* ------------------------------------------------------------------ */

const REVOKED_TTL_MS = 10_000; // same doctrine/latency as the authUser micro-cache
const REVOKED_MAX = 400;
const revokedCache = new Map<number, RevokedAtEntry>();

/** Drop a user's cached cutoff (call right after revoking, self or admin). */
export function invalidateRevokedAtCache(userId?: number): void {
  if (userId === undefined) revokedCache.clear();
  else revokedCache.delete(userId);
}

type CookieStore = Awaited<ReturnType<typeof nextCookies>>;

export async function getIronSession<T extends SessionData = SessionData>(
  cookieStore: CookieStore,
  options: SessionOptions
): Promise<IronSession<T>> {
  const session = await getIronSessionRaw<T>(cookieStore, options);

  const userId = Number(session.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return session;

  let revoked: number | null | "stale" = pickFreshRevokedAt(
    revokedCache.get(userId),
    Date.now(),
    REVOKED_TTL_MS
  );
  if (revoked === "stale") {
    let resolved: number | null = null;
    try {
      const result = await pool.query(
        `SELECT floor(extract(epoch from sessions_revoked_at))::bigint AS revoked_at
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      if (result.rows.length === 0) {
        resolved = Number.POSITIVE_INFINITY; // deleted user: fail closed
      } else {
        // NULL/missing cell = never revoked. Do NOT Number() it: Number(null)===0
        // would fake an epoch-0 cutoff and (prod incident 27 Sep) clear every
        // healthy session. Only a real timestamp counts.
        const cell = result.rows[0]?.revoked_at;
        const raw = cell === null || cell === undefined ? null : Number(cell);
        resolved = raw !== null && Number.isFinite(raw) ? raw : null;
      }
    } catch (err) {
      // DB blip doctrine (same as authUser/adminAuth): serve the signed
      // session now; the revocation lands the moment the pooler answers.
      // A revocation during a DB outage taking seconds-not-zero is an
      // accepted trade — recorded in the kit MANIFEST.
      console.error("[session] revocation check failed, using signed session:", err);
      resolved = null;
    }
    if (revokedCache.size >= REVOKED_MAX) revokedCache.clear();
    revokedCache.set(userId, { revoked: resolved, at: Date.now() });
    revoked = resolved;
  }

  const cutoff = revoked as number | null;
  if (
    !sessionSurvivesVerification(
      session.user?.loginAt,
      session.user?.revokets,
      cutoff
    )
  ) {
    // In-memory only: no cookie mutation on read paths (GET-safe routes stay
    // side-effect free). The dead cookie just keeps 401ing until it is
    // replaced by the next real login or cleared by logout.
    session.user = undefined;
  }

  return session;
}
