import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isBotAdminAuthorized, unauthorizedMachineResponse } from "@/lib/machineAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bot-facing roster-health data source: every website user + their role.
// The MCWV bot calls this server-to-server (shared X-Admin-API-Key) so its
// /rosterhealth command can compare website roles against Discord roles and
// the in-game PS99 clan ranks.

export async function GET(request: Request) {
  if (!isBotAdminAuthorized(request)) {
    return unauthorizedMachineResponse();
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
