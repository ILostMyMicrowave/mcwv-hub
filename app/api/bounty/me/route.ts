/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in entrant's own secret view: their two targets for the live
 * round plus live in-round point gains (latest snapshot minus the round
 * baseline slot). This is the ONLY endpoint that ever returns targets.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const base: Record<string, unknown> = {
      success: true,
      role: user.role,
      robloxId: user.robloxId,
      eventStatus: null,
      signedUp: false,
      status: null as string | null,
      eliminatedRound: null,
      finalPlace: null,
      roundNo: null,
      you: null,
      targets: [],
    };

    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.bounty_events') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) {
      return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
    }

    const eventRes = await pool.query<any>(
      `SELECT id, battle_id, status, round_count, started_at
       FROM bounty_events
       WHERE status IN ('signup', 'active')
       ORDER BY id DESC
       LIMIT 1`
    );
    let eventRow = eventRes.rows[0] ?? null;
    if (!eventRow) {
      const fallback = await pool.query<any>(
        `SELECT id, battle_id, status, round_count, started_at
         FROM bounty_events
         ORDER BY id DESC
         LIMIT 1`
      );
      eventRow = fallback.rows[0] ?? null;
    }
    if (!eventRow || !user.robloxId) {
      return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
    }

    const eventId = Number(eventRow.id);
    const status = String(eventRow.status);
    base.eventStatus = status;

    const meRes = await pool.query<any>(
      `SELECT roblox_id, username, status, eliminated_round, final_place
       FROM bounty_entrants
       WHERE event_id = $1 AND roblox_id = $2
       LIMIT 1`,
      [eventId, user.robloxId]
    );
    const meRow = meRes.rows[0];
    if (!meRow) {
      return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
    }

    base.signedUp = true;
    base.status = String(meRow.status);
    base.eliminatedRound = meRow.eliminated_round === null || meRow.eliminated_round === undefined ? null : Number(meRow.eliminated_round);
    base.finalPlace = meRow.final_place === null || meRow.final_place === undefined ? null : Number(meRow.final_place);

    if (status !== "active" || String(meRow.status) !== "alive") {
      return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
    }

    // Current in-progress round and its baseline slot (the slot of the last
    // closed round - exactly what the engine will score the next close on).
    const roundNo = Number(eventRow.round_count ?? 0) + 1;
    base.roundNo = roundNo;
    const baselineRes = await pool.query<any>(
      `SELECT slot_at FROM bounty_rounds
       WHERE event_id = $1
       ORDER BY round_no DESC
       LIMIT 1`,
      [eventId]
    );
    const baselineSlot = baselineRes.rows[0]?.slot_at ?? null;

    // My two targets for the live round.
    const targetsRes = await pool.query<any>(
      `SELECT t.target_roblox_id AS roblox_id, e.username, e.avatar_url
       FROM bounty_targets t
       LEFT JOIN bounty_entrants e
         ON e.event_id = t.event_id AND e.roblox_id = t.target_roblox_id
       WHERE t.event_id = $1 AND t.round_no = $2 AND t.hunter_roblox_id = $3
       ORDER BY t.target_roblox_id ASC`,
      [eventId, roundNo, user.robloxId]
    );

    const battleKey = String(eventRow.battle_id ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    const ids = [user.robloxId, ...targetsRes.rows.map((r: any) => String(r.roblox_id))].filter(Boolean);

    const points = new Map<string, { now: number | null; atBaseline: number | null; lastPph: number | null }>();
    for (const id of ids) points.set(id, { now: null, atBaseline: null, lastPph: null });

    if (battleKey && ids.length) {
      const [latestRes, baselinePtsRes, lastPphRes] = await Promise.all([
        pool.query<any>(
          `SELECT DISTINCT ON (roblox_id) roblox_id, points::bigint AS points
           FROM hourly_stats_player_snapshots
           WHERE battle_id = $1 AND roblox_id = ANY($2::text[])
           ORDER BY roblox_id, scheduled_at DESC`,
          [battleKey, ids]
        ),
        baselineSlot
          ? pool.query<any>(
              `SELECT roblox_id, points::bigint AS points
               FROM hourly_stats_player_snapshots
               WHERE battle_id = $1 AND scheduled_at = $2 AND roblox_id = ANY($3::text[])`,
              [battleKey, baselineSlot, ids]
            )
          : Promise.resolve({ rows: [] as any[] }),
        pool.query<any>(
          `SELECT roblox_id, pph::bigint AS pph
           FROM bounty_round_pph
           WHERE event_id = $1
             AND round_no = (SELECT MAX(round_no) FROM bounty_round_pph WHERE event_id = $1)`,
          [eventId]
        ),
      ]);
      for (const row of latestRes.rows) {
        const id = String(row.roblox_id);
        if (points.has(id)) points.get(id)!.now = Number(row.points ?? 0);
      }
      for (const row of baselinePtsRes.rows) {
        const id = String(row.roblox_id);
        if (points.has(id)) points.get(id)!.atBaseline = Number(row.points ?? 0);
      }
      for (const row of lastPphRes.rows) {
        const id = String(row.roblox_id);
        if (points.has(id)) points.get(id)!.lastPph = Number(row.pph ?? 0);
      }
    }

    const gain = (id: string): number | null => {
      const p = points.get(id);
      if (!p || p.now === null || p.atBaseline === null) return null;
      return Math.max(0, p.now - p.atBaseline);
    };

    const mine = points.get(user.robloxId);
    base.you = {
      pointsNow: mine?.now ?? null,
      roundGain: gain(user.robloxId),
      lastPph: mine?.lastPph ?? null,
    };

    base.targets = targetsRes.rows.map((r: any) => {
      const id = String(r.roblox_id);
      const p = points.get(id);
      return {
        robloxId: id,
        username: String(r.username ?? "Unknown hunter"),
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        pointsNow: p?.now ?? null,
        roundGain: gain(id),
        lastPph: p?.lastPph ?? null,
      };
    });

    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/bounty/me] error:", err);
    return NextResponse.json({ success: false, error: "Failed to load your hunt" }, { status: 500 });
  }
}
