import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Battle = {
  battle_id: string;
  battle_name: string | null;
  start_time: Date | null;
  end_time: Date | null;
};

async function tableExists(table: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [table]
  );
  return Boolean(rows[0]?.exists);
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    // We can only list wars we have per-player leaderboard cache for.
    if (!(await tableExists("public.player_leaderboard_history"))) {
      return NextResponse.json({ success: true, battles: [] });
    }

    // "Cached" wars = those the collector actually wrote snapshots for. That's
    // the accurate-tracking signal (the collector only caches a war it
    // tracked), not a hard date. We require a war_snapshots row so we never
    // list wars we didn't cache. If the snapshots table is missing (older DB),
    // fall back to player-history existence only.
    const snapshotsExist = await tableExists("public.war_snapshots");

    const result = await pool.query<Battle>(
      `SELECT b.battle_id, b.battle_name, b.start_time, b.end_time
       FROM battles b
       WHERE b.end_time IS NOT NULL
         AND b.end_time <= NOW()
         AND EXISTS (
           SELECT 1
           FROM player_leaderboard_history h
           WHERE regexp_replace(lower(h.battle_id), '[^a-z0-9]+', '', 'g') =
                 regexp_replace(lower(b.battle_id), '[^a-z0-9]+', '', 'g')
             AND h.points IS NOT NULL
           LIMIT 1
         )
         ${snapshotsExist ? `AND EXISTS (
           SELECT 1
           FROM war_snapshots ws
           WHERE ws.battle_id = b.battle_id
           LIMIT 1
         )` : ""}
       ORDER BY b.start_time DESC NULLS LAST, b.created_at DESC
       LIMIT 50`
    );

    const battles = result.rows.map((row) => ({
      battle_id: row.battle_id,
      battle_name: row.battle_name,
      start_time: row.start_time ? row.start_time.toISOString() : null,
      end_time: row.end_time ? row.end_time.toISOString() : null,
    }));

    return NextResponse.json({
      success: true,
      battles,
    });
  } catch (err) {
    console.error("[war/history] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load war history" },
      { status: 500 }
    );
  }
}
