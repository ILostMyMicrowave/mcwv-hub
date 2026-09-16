import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import { logAdminAction } from "@/lib/adminAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Join the hunt. Requires a linked Roblox account, an open sign-up event,
 *  and headroom under the officer-set cap. */
export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Sign in to enter the hunt" }, { status: 401 });
    }
    if (!user.robloxId) {
      return NextResponse.json(
        { success: false, error: "Link your Roblox account on your profile first, then come back" },
        { status: 400 }
      );
    }

    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.bounty_events') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) {
      return NextResponse.json({ success: false, error: "No hunt is open right now" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const eventRes = await client.query<{ id: string; status: string; signup_cap: number }>(
        `SELECT id, status, signup_cap
         FROM bounty_events
         WHERE status IN ('signup', 'active')
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`
      );
      const event = eventRes.rows[0];
      if (!event || event.status !== "signup") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "Sign-up for this hunt is closed" },
          { status: 400 }
        );
      }

      const alreadyRes = await client.query(
        `SELECT 1 FROM bounty_entrants WHERE event_id = $1 AND roblox_id = $2`,
        [event.id, user.robloxId]
      );
      if (alreadyRes.rows.length) {
        const countRes = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM bounty_entrants WHERE event_id = $1`,
          [event.id]
        );
        await client.query("COMMIT");
        return NextResponse.json({
          success: true,
          joined: true,
          alreadyIn: true,
          entrantsCount: Number(countRes.rows[0]?.total ?? 1),
        });
      }

      const countRes = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM bounty_entrants WHERE event_id = $1`,
        [event.id]
      );
      const entrantsCount = Number(countRes.rows[0]?.total ?? 0);
      if (entrantsCount >= Number(event.signup_cap ?? 75)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "The hunt is full" },
          { status: 400 }
        );
      }

      await client.query(
        `INSERT INTO bounty_entrants (event_id, roblox_id, discord_id, username, status)
         VALUES ($1, $2, $3, $4, 'alive')
         ON CONFLICT (event_id, roblox_id) DO NOTHING`,
        [event.id, user.robloxId, user.discordId ? BigInt(user.discordId) : null, user.username]
      );

      const afterRes = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM bounty_entrants WHERE event_id = $1`,
        [event.id]
      );
      await client.query("COMMIT");

      await logAdminAction({
        event: "Bounty Hunt",
        message: `${user.username} signed up for bounty event #${event.id}`,
        action: "bounty_signup",
        actor: { id: user.id, username: user.username, role: user.role } as never,
        metadata: { event_id: Number(event.id), roblox_id: user.robloxId },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        joined: true,
        alreadyIn: false,
        entrantsCount: Number(afterRes.rows[0]?.total ?? entrantsCount + 1),
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[api/bounty/signup] error:", err);
    return NextResponse.json({ success: false, error: "Could not join right now" }, { status: 500 });
  }
}
