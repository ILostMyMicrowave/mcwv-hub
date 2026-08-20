import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bot-facing check: has a user connected their PS99 account (BIG Games OAuth)?
// The MCWV bot calls this server-to-server (shared X-Admin-API-Key) before
// letting someone open an application ticket, so every applicant is required
// to authorize the app first.
//
// Body: { discord_id } or { roblox_id }. We look up the hub user's linked
// BIG Games token and return connected: true/false.

function authorized(request: Request) {
  const authHeader = request.headers.get("x-admin-api-key") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  const provided = authHeader || (bearer.toLowerCase().startsWith("bearer ") ? bearer.split(" ")[1] : "");
  const expected = process.env.BOT_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? "";
  return Boolean(expected && provided && provided === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const discordId = String(body.discord_id ?? body.discordId ?? "").trim();
    const robloxId = String(body.roblox_id ?? body.robloxId ?? "").trim();

    if (!discordId && !robloxId) {
      return NextResponse.json(
        { success: false, error: "discord_id or roblox_id is required" },
        { status: 400 }
      );
    }

    // If we have a discord id, first resolve the hub user by discord_id (which
    // carries roblox_id). Otherwise match by roblox_id directly.
    let robloxIdForCheck = robloxId;
    if (!robloxIdForCheck && discordId) {
      const user = await pool.query(
        `SELECT roblox_id FROM users WHERE discord_id = $1 LIMIT 1`,
        [discordId]
      );
      if (user.rows[0]?.roblox_id) robloxIdForCheck = String(user.rows[0].roblox_id);
    }

    let connected = false;
    let robloxIdConnected: string | null = null;
    if (robloxIdForCheck) {
      const token = await pool.query(
        `SELECT roblox_id FROM big_games_tokens WHERE roblox_id = $1 LIMIT 1`,
        [robloxIdForCheck]
      );
      connected = Boolean(token.rows[0]);
      robloxIdConnected = token.rows[0]?.roblox_id ?? null;
    }

    return NextResponse.json({
      success: true,
      connected,
      robloxId: robloxIdConnected,
    });
  } catch (err) {
    console.error("[internal/biggames-connected] failed:", err);
    return NextResponse.json({ success: false, error: "Failed to check connection" }, { status: 500 });
  }
}
