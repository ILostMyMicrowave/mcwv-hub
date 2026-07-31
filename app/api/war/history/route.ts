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

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.player_leaderboard_history') IS NOT NULL AS exists`
    );

    if (!exists.rows[0]?.exists) {
      return NextResponse.json({ success: true, battles: [] });
    }

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
