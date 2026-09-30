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

// Per-isolate cache — 5 min. Auth/me is called on every page, so cache avoids DB hammer
const AUTH_CACHE_TTL_MS = 300_000;
const AUTH_CACHE_MAX = 200;
const authCache = new Map<number, { user: AuthenticatedUser; at: number }>();

export function invalidateAuthenticatedUserCache(userId?: number): void {
  if (userId === undefined) authCache.clear();
  else authCache.delete(userId);
}

// Background revalidation — don't block request on cold isolate
function revalidateInBackground(userId: number) {
  void (async () => {
    try {
      const result = await pool.query(
        `SELECT id, username, role, discord_id, roblox_id FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const row = result.rows[0];
      if (!row) return;
      const verified: AuthenticatedUser = {
        id: Number(row.id),
        username: String(row.username ?? ""),
        role: normalizeRole(row.role),
        discordId: row.discord_id == null ? null : String(row.discord_id),
        robloxId: row.roblox_id == null ? null : String(row.roblox_id),
      };
      if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
      authCache.set(userId, { user: verified, at: Date.now() });
    } catch {
      // ignore — will retry on next request
    }
  })();
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

  // FIX for "ALWAYS timeout": cold isolates were forced to wait for DB (3-10s + retry) on every first request
  // Instead, return signed session immediately (0 DB) and revalidate in background
  // This eliminates the timeout warning for auth/me entirely on cold start
  const sessionUser: AuthenticatedUser = {
    id: userId,
    username: String(session.user?.username ?? ""),
    role: normalizeRole(session.user?.role),
    discordId:
      session.user?.discordId == null ? null : String(session.user?.discordId),
    robloxId: null, // needs DB, comes back after background revalidation
  };

  // If we have no cache at all, serve session now and warm cache in background
  if (!cached) {
    revalidateInBackground(userId);
    // If session has no username (very old cookie), fall through to DB attempt once
    if (sessionUser.username) return sessionUser;
  }

  try {
    const result = await pool.query(
      `SELECT id, username, role, discord_id, roblox_id FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return cached?.user ?? sessionUser ?? null;

    const verified: AuthenticatedUser = {
      id: Number(row.id),
      username: String(row.username ?? ""),
      role: normalizeRole(row.role),
      discordId: row.discord_id == null ? null : String(row.discord_id),
      robloxId: row.roblox_id == null ? null : String(row.roblox_id),
    };
    if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
    authCache.set(userId, { user: verified, at: Date.now() });
    return verified;
  } catch (err) {
    // DB blip — serve session or stale cache, don't 500
    if (cached) return cached.user;
    console.warn("[auth user] db blip, serving session:", (err as Error).message?.slice(0, 120));
    return sessionUser;
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
