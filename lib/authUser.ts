import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
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

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  const userId = Number(session.user?.id);
  if (!Number.isFinite(userId)) return null;

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

    return {
      id: Number(row.id),
      username: String(row.username ?? ""),
      role: normalizeRole(row.role),
      discordId: row.discord_id === null || row.discord_id === undefined ? null : String(row.discord_id),
      robloxId: row.roblox_id === null || row.roblox_id === undefined ? null : String(row.roblox_id),
    };
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
