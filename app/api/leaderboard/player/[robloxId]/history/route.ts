import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PointRow = {
  points_added: number | string;
  created_at: Date | string;
};

type DisconnectRow = {
  created_at: Date | string;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );

  return Boolean(result.rows[0]?.exists);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ robloxId: string }> }
) {
  try {
    const { robloxId } = await params;
    const userId = Number(robloxId);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid Roblox ID" }, { status: 400 });
    }

    const pointHistoryExists = await tableExists("point_history");
    const points: Array<{ time: string; value: number; delta: number }> = [];

    let change5m = 0;
    let pph = 0;

    if (pointHistoryExists) {
      const result = await pool.query<PointRow>(
        `SELECT points_added, created_at
         FROM point_history
         WHERE user_id = $1
         ORDER BY created_at ASC
         LIMIT 500`,
        [userId]
      );

      let running = 0;
      const now = Date.now();
      for (const row of result.rows) {
        const delta = Number(row.points_added ?? 0);
        const safeDelta = Number.isFinite(delta) ? delta : 0;
        const createdAtMs = new Date(row.created_at).getTime();
        running += safeDelta;

        if (now - createdAtMs <= 5 * 60 * 1000) change5m += safeDelta;
        if (now - createdAtMs <= 60 * 60 * 1000) pph += safeDelta;

        points.push({
          time: toIso(row.created_at),
          value: running,
          delta: safeDelta,
        });
      }
    }

    const presenceEventsExists = await tableExists("player_presence_events");
    let disconnects24h = 0;
    const disconnects: Array<{ time: string; value: number }> = [];

    if (presenceEventsExists) {
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM player_presence_events
         WHERE roblox_id::text = $1
           AND created_at >= NOW() - INTERVAL '24 hours'
           AND LOWER(COALESCE(previous_status::text, '')) IN ('in_game', 'ingame', '2')
           AND LOWER(COALESCE(next_status::text, '')) IN ('offline', 'online', '0', '1')`,
        [String(userId)]
      );

      disconnects24h = Number(countResult.rows[0]?.count ?? 0);

      const rows = await pool.query<DisconnectRow>(
        `SELECT created_at
         FROM player_presence_events
         WHERE roblox_id::text = $1
           AND created_at >= NOW() - INTERVAL '7 days'
           AND LOWER(COALESCE(previous_status::text, '')) IN ('in_game', 'ingame', '2')
           AND LOWER(COALESCE(next_status::text, '')) IN ('offline', 'online', '0', '1')
         ORDER BY created_at ASC
         LIMIT 500`,
        [String(userId)]
      );

      rows.rows.forEach((row, index) => {
        disconnects.push({ time: toIso(row.created_at), value: index + 1 });
      });
    }

    return NextResponse.json({
      success: true,
      robloxId: String(userId),
      points,
      rank: [],
      disconnects,
      disconnects24h,
      change5m,
      pph,
    });
  } catch (err) {
    console.error("[leaderboard/player/history] error:", err);
    return NextResponse.json(
      { error: "Failed to load player history" },
      { status: 500 }
    );
  }
}
