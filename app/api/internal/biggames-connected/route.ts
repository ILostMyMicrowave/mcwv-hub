import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { validateBigGamesToken } from "@/lib/biggames";
import { isBotAdminAuthorized, unauthorizedMachineResponse } from "@/lib/machineAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bot-facing check: has a user connected their PS99 account (BIG Games OAuth)?
// The MCWV bot calls this server-to-server (shared X-Admin-API-Key) before
// letting someone open an application ticket, so every applicant is required
// to authorize the app first.
//
// Body: { discord_id } or { roblox_id }. We look up the hub user's linked
// BIG Games token and return connected: true/false.

export async function POST(request: Request) {
  if (!isBotAdminAuthorized(request)) {
    return unauthorizedMachineResponse();
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
    // carries roblox_id AND id). Otherwise match by roblox_id directly.
    let robloxIdForCheck = robloxId;
    let userIdForCheck: string | null = null;
    if (!robloxIdForCheck && discordId) {
      const user = await pool.query(
        `SELECT roblox_id, id FROM users WHERE discord_id = $1 LIMIT 1`,
        [discordId]
      );
      if (user.rows[0]?.roblox_id) robloxIdForCheck = String(user.rows[0].roblox_id);
      if (user.rows[0]?.id) userIdForCheck = String(user.rows[0].id);
    }

    let connected = false;
    let robloxIdConnected: string | null = null;

    // 1) Applicant path: token keyed directly by Discord ID (no hub account).
    if (discordId && !connected) {
      const dToken = await pool.query(
        `SELECT access_token, roblox_id FROM big_games_discord_tokens WHERE discord_id = $1 LIMIT 1`,
        [discordId]
      );
      const dRow = dToken.rows[0];
      if (dRow) {
        const check = await validateBigGamesToken(dRow.access_token);
        if (check.valid) {
          connected = true;
          robloxIdConnected = dRow.roblox_id ?? null;
        } else {
          await pool.query(`DELETE FROM big_games_discord_tokens WHERE discord_id = $1`, [discordId]);
        }
      }
    }

    // 2) Member path: token keyed by the user's linked Roblox id OR hub user_id
    // (member tokens may be stored with a NULL roblox_id keyed by user_id).
    if ((robloxIdForCheck || userIdForCheck) && !connected) {
      let tokenRow: any = null;
      if (robloxIdForCheck) {
        const token = await pool.query(
          `SELECT roblox_id, access_token FROM big_games_tokens WHERE roblox_id = $1 LIMIT 1`,
          [robloxIdForCheck]
        );
        tokenRow = token.rows[0];
      }
      if (!tokenRow && userIdForCheck) {
        const token = await pool.query(
          `SELECT roblox_id, access_token FROM big_games_tokens WHERE user_id = $1 LIMIT 1`,
          [userIdForCheck]
        );
        tokenRow = token.rows[0];
      }
      if (tokenRow) {
        // Verify the stored token is still valid against BIG Games. Revoking
        // the app (or an expired 30-day token) must count as "not connected",
        // otherwise someone who revoked it keeps slipping through the gate.
        const check = await validateBigGamesToken(tokenRow.access_token);
        if (check.valid) {
          connected = true;
          robloxIdConnected = tokenRow.roblox_id ?? null;
        } else {
          // Revoked/expired - clear the stale row so it stops passing the gate.
          if (robloxIdForCheck) {
            await pool.query(`DELETE FROM big_games_tokens WHERE roblox_id = $1`, [robloxIdForCheck]);
          }
          if (userIdForCheck) {
            await pool.query(`DELETE FROM big_games_tokens WHERE user_id = $1`, [userIdForCheck]);
          }
        }
      }
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
