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

const REVOKED_TTL_MS = 3_000; // revocations land in <=3s (user: "make it faster"); authUser cache stays 10s
const REVOKED_MAX = 400;
const revokedCache = new Map<number, RevokedAtEntry>();

/** Drop a user's cached cutoff (call right after revoking, self or admin). */
export function invalidateRevokedAtCache(userId?: number): void {
  if (userId === undefined) revokedCache.clear();
  else revokedCache.delete(userId);
}

const REVOKED_QUERY_CAP_MS = 1_200;

/** Row-shape decoder shared by fast and late paths. */
function readRevokedCell(result: { rows?: Array<{ revoked_at?: string | number | null }> }): number | null {
  const rows = result.rows ?? [];
  if (rows.length === 0) return Number.POSITIVE_INFINITY; // deleted user: fail closed
  // NULL/missing cell = never revoked. Do NOT Number() it: Number(null)===0
  // would fake an epoch-0 cutoff and (prod incident 27 Sep) clear every
  // healthy session. Only a real timestamp counts.
  const cell = rows[0]?.revoked_at;
  if (cell === null || cell === undefined) return null;
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
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
    // THE CAP (prod 2026-09-27): pool.query rides the shared 6x-retry wrapper
    // (~60s worst case on a flapping Supabase pooler). A revocation check is
    // a courtesy, not a gate - it must NEVER make a request slow. Cap at 1.2s:
    // past that, fail-open NOW and keep the page instant; if the DB answers
    // late, the real cutoff still lands in the cache for subsequent reads.
    const q = pool.query(
      `SELECT floor(extract(epoch from sessions_revoked_at))::bigint AS revoked_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    const settled = await Promise.race([
      q.then(
        (result: { rows?: Array<{ revoked_at?: string | number | null }> }) =>
          ({ kind: "ok" as const, result })
      ),
      new Promise<{ kind: "timeout" }>((resolveTimeout) =>
        setTimeout(() => resolveTimeout({ kind: "timeout" }), REVOKED_QUERY_CAP_MS)
      ),
    ]).catch((err) => {
      console.error("[session] revocation check failed, using signed session:", err);
      return { kind: "err" as const };
    });
    if (settled.kind === "ok") {
      resolved = readRevokedCell(settled.result);
    } else {
      resolved = null; // fail-open (fast error or cap)
      if (settled.kind === "timeout") {
        void q
          .then((late: { rows?: Array<{ revoked_at?: string | number | null }> }) => {
            if (revokedCache.size >= REVOKED_MAX) revokedCache.clear();
            revokedCache.set(userId, { revoked: readRevokedCell(late), at: Date.now() });
          })
          .catch(() => { /* retries eventually died too */ });
      }
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
    session.user = undefined;
    // DO NOT re-add cookie eviction here (27 Sep): destroying the cookie
    // from this choke point took the site down on phones (RSC page renders
    // share this function and Next 16 forbids the mutation mid-render).
    // The dead cookie simply keeps 401ing; a real login replaces it, a real
    // logout clears it. Visible-logout UX is a client-side job (401 ->
    // /login redirect like the notifications page) if we ever want it.
  }

  return session;
}
