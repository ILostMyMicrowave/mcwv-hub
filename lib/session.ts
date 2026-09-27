import type { SessionOptions, IronSession } from "iron-session";
import { getIronSession as getIronSessionRaw } from "iron-session";
import type { cookies as nextCookies } from "next/headers";
import { pool } from "@/lib/db";

export type SessionUser = {
  id: number;
  username: string;
  role?: string | null;
  discordId?: string | null;
  /**
   * v2: device id minted at login (uuid, see /api/auth/login) and bound to a
   * row in mcwv_user_sessions. THE ONLY thing that makes a cookie valid -
   * no timestamps, no grace tokens, no legacy shapes. A cookie without a
   * well-formed sid (e.g. everything minted before v2) is dead on read.
   */
  sid?: string;
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
/* v2 "sign out everywhere" — the whole mechanism in one choke point. */
/*                                                                    */
/* A session is real iff its sid row is unrevoked (and its user still */
/* exists). Every page/API already branches on `session.user?.id`,    */
/* so killing `user` here kills everything, with zero per-route code. */
/* The row lookup is per-DEVICE and cached for 3s; during DB trouble  */
/* the check is capped at 1.2s and fail-opens (site doctrine: a       */
// /* blip must never log people out or make pages wait on the pooler). */
/* ------------------------------------------------------------------ */

const SID_CHECK_TTL_MS = 3_000; // revocations land on other devices <= ~3s
const SID_QUERY_CAP_MS = 1_200; // storm cap (prod 2026-09-27): never slow a page
const SID_CACHE_MAX = 400;

const sidCache = new Map<string, { alive: boolean; at: number }>();

/** Force the next read for `sid` (or all) to re-check the database. */
export function invalidateSessionCache(sid?: string): void {
  if (sid === undefined) sidCache.clear();
  else sidCache.delete(sid);
}

const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SidRow = { alive?: boolean | null; user_exists?: boolean | null } | undefined;

function readSidRow(result: unknown): boolean {
  const rows = (result as { rows?: SidRow[] } | null)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return false; // row gone = dead
  const row = rows[0];
  return row?.alive === true && row?.user_exists === true;
}

type CookieStore = Awaited<ReturnType<typeof nextCookies>>;

export async function getIronSession<T extends SessionData = SessionData>(
  cookieStore: CookieStore,
  options: SessionOptions
): Promise<IronSession<T>> {
  const session = await getIronSessionRaw<T>(cookieStore, options);

  const sid = session.user?.sid;
  if (typeof sid !== "string" || !SID_RE.test(sid)) {
    // Legacy/v1 cookie or tampered shape: no sid row can vouch for it -> dead.
    session.user = undefined;
    return session;
  }

  const now = Date.now();
  const cached = sidCache.get(sid);
  let alive: boolean;

  if (cached && now - cached.at < SID_CHECK_TTL_MS) {
    alive = cached.alive;
  } else {
    const q = pool.query(
      `SELECT s.revoked_at IS NULL AS alive,
              u.id IS NOT NULL AS user_exists
       FROM mcwv_user_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.sid = $1
       LIMIT 1`,
      [sid]
    );
    const settled = await Promise.race([
      q.then((result) => ({ kind: "ok" as const, result })),
      new Promise<{ kind: "timeout" }>((resolveTimeout) =>
        setTimeout(() => resolveTimeout({ kind: "timeout" }), SID_QUERY_CAP_MS)
      ),
    ]).catch((err) => {
      console.error("[session] sid check failed, trusting cookie briefly:", err);
      return { kind: "error" as const };
    });

    if (settled.kind === "ok") {
      alive = readSidRow(settled.result);
      if (sidCache.size > SID_CACHE_MAX) sidCache.clear();
      sidCache.set(sid, { alive, at: Date.now() });
    } else {
      // DB blip or storm: let this request through NOW, cache the mercy
      // briefly, and let the late answer (if any) correct the cache - the
      // revocation then lands the moment the pooler breathes.
      alive = true;
      if (sidCache.size > SID_CACHE_MAX) sidCache.clear();
      sidCache.set(sid, { alive: true, at: Date.now() });
      void q
        .then((result) => {
          sidCache.set(sid, { alive: readSidRow(result), at: Date.now() });
        })
        .catch(() => {
          /* retries eventually died too; next request tries again */
        });
    }
  }

  if (!alive) {
    // In-memory only on read paths; the kick itself (route side) plus the
    // push->service-worker bounce handle the visible logout.
    session.user = undefined;
  }

  return session;
}
