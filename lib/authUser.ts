import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "@/lib/session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { pool } from "@/lib/db";

export type AuthenticatedUser = {
  id: number;
  username: string;
  role: "member" | "officer" | "owner";
  discordId: string | null;
  robloxId: string | null;
};

type AuthCheck =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

function normalizeRole(role: unknown): AuthenticatedUser["role"] {
  return role === "owner" || role === "officer" ? role : "member";
}

// Per-isolate identity micro-cache. The SIGNED session already carries the
// user id; the DB query below only re-validates and enriches it. During
// pooler waves that query was the single biggest per-request cost — every
// authenticated route paid a connect ladder before its payload cache could
// help — so cache the verified row for a few seconds.
//
// Safety: the key comes from the signed session, so logout is honoured
// instantly (no session → no id → no cache lookup). The only staleness is a
// role/username change landing up to AUTH_CACHE_TTL_MS late on a warm
// isolate, which is an acceptable trade against 30-60s hangs for a
// 65-member clan hub.
const AUTH_CACHE_TTL_MS = 10_000;
const AUTH_CACHE_MAX = 200;
const authCache = new Map<number, { user: AuthenticatedUser; at: number }>();

/** Drop cached identity (e.g. right after an admin role change). */
export function invalidateAuthenticatedUserCache(userId?: number): void {
  if (userId === undefined) authCache.clear();
  else authCache.delete(userId);
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  const userId = Number(session.user?.id);
  if (!Number.isFinite(userId)) return null;

  const cached = authCache.get(userId);
  if (cached && Date.now() - cached.at < AUTH_CACHE_TTL_MS) {
    return cached.user;
  }

  try {
    const result = await pool.query(
      `SELECT id, username, role, discord_id, roblox_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const row = result.rows[0];
    if (!row) return null;

    const verified: AuthenticatedUser = {
      id: Number(row.id),
      username: String(row.username ?? ""),
      role: normalizeRole(row.role),
      discordId: row.discord_id === null || row.discord_id === undefined ? null : String(row.discord_id),
      robloxId: row.roblox_id === null || row.roblox_id === undefined ? null : String(row.roblox_id),
    };
    if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
    authCache.set(userId, { user: verified, at: Date.now() });
    return verified;
  } catch (err) {
    // DB blip (pooler saturation, cold-connect timeout): the signed session
    // already carries id/username/role, so serve that (possibly stale)
    // instead of 500-ing every authenticated call — same pattern as
    // /api/auth/me. Full fields (discord_id, roblox_id) need the DB and come
    // back on the next healthy request.
    console.error("[auth user] live verify failed, using signed session:", err);
    return {
      id: userId,
      username: String(session.user?.username ?? ""),
      role: normalizeRole(session.user?.role),
      // discordId rides in the session for post-19-Sep logins (used by the
      // broadcast gate); roblox_id still needs the DB and comes back on the
      // next healthy request.
      discordId:
        session.user?.discordId === null || session.user?.discordId === undefined
          ? null
          : String(session.user?.discordId),
      robloxId: null,
    };
  }
}

export async function requireAuthenticatedUser(): Promise<AuthCheck> {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    return { ok: true, user };
  } catch (err) {
    console.error("[auth user] error:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to verify authentication" },
        { status: 500 }
      ),
    };
  }
}
