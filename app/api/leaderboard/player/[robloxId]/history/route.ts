import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PointRow = {
  points_added: number | string;
  created_at: Date | string;
};

type SnapshotRow = {
  points: number | string | null;
  rank: number | string | null;
  pph: number | string | null;
  change_5m: number | string | null;
  captured_at: Date | string;
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

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

    const points: Array<{ time: string; value: number; delta?: number }> = [];
    const rank: Array<{ time: string; value: number }> = [];

    let change5m = 0;
    let pph = 0;

    const snapshotHistoryExists = await tableExists("player_leaderboard_history");

    if (snapshotHistoryExists) {
      const snapshotResult = await pool.query<SnapshotRow>(
        `SELECT points, rank, pph, change_5m, captured_at
         FROM player_leaderboard_history
         WHERE roblox_id::text = $1
         ORDER BY captured_at ASC
         LIMIT 500`,
        [String(userId)]
      );

      let previousPoints: number | null = null;
      for (const row of snapshotResult.rows) {
        const value = asNumber(row.points);
        const ranked = asNumber(row.rank);
        const iso = toIso(row.captured_at);

        points.push({
          time: iso,
          value,
          delta: previousPoints === null ? 0 : Math.max(0, value - previousPoints),
        });

        if (ranked > 0) {
          rank.push({ time: iso, value: ranked });
        }

        previousPoints = value;
      }

      const latest = snapshotResult.rows[snapshotResult.rows.length - 1];
      if (latest) {
        change5m = asNumber(latest.change_5m);
        pph = asNumber(latest.pph);
      }
    }

    const pointHistoryExists = await tableExists("point_history");

    // Fallback for older installs before snapshot history existed.
    if (!points.length && pointHistoryExists) {
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
        const delta = asNumber(row.points_added);
        const createdAtMs = new Date(row.created_at).getTime();
        running += delta;

        if (now - createdAtMs <= 5 * 60 * 1000) change5m += delta;
        if (now - createdAtMs <= 60 * 60 * 1000) pph += delta;

        points.push({
          time: toIso(row.created_at),
          value: running,
          delta,
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
      rank,
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
