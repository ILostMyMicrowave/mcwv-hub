import { NextResponse } from "next/server";
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
  try {
    const result = await pool.query<Battle>(
      `SELECT battle_id, battle_name, start_time, end_time
       FROM battles
       ORDER BY start_time DESC NULLS LAST, created_at DESC
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
