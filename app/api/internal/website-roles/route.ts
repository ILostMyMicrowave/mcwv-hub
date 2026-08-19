import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bot-facing roster-health data source: every website user + their role.
// The MCWV bot calls this server-to-server (shared X-Admin-API-Key) so its
// /rosterhealth command can compare website roles against Discord roles and
// the in-game PS99 clan ranks.

function authorized(request: Request) {
  const authHeader = request.headers.get("x-admin-api-key") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  const provided = authHeader || (bearer.toLowerCase().startsWith("bearer ") ? bearer.split(" ")[1] : "");
  const expected = process.env.BOT_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? "";
  return Boolean(expected && provided && provided === expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, username, role, discord_id, roblox_id
       FROM users
       ORDER BY role, LOWER(username)`
    );

    const users = rows.map((row) => ({
      id: Number(row.id),
      username: String(row.username ?? ""),
      role: String(row.role ?? "member"),
      discordId: row.discord_id === null || row.discord_id === undefined ? null : String(row.discord_id),
      robloxId: row.roblox_id === null || row.roblox_id === undefined ? null : String(row.roblox_id),
    }));

    return NextResponse.json({ success: true, users });
  } catch (err) {
    console.error("[internal/website-roles] failed:", err);
    return NextResponse.json({ success: false, error: "Failed to load website roles" }, { status: 500 });
  }
}
