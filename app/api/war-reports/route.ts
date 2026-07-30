import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";

type BattleRow = {
  battle_id: string;
  battle_name: string | null;
  start_time: Date | string | null;
  end_time: Date | string | null;
  final_rank: number | string | null;
  final_points: number | string | null;
  captured_at: Date | string | null;
};

type PlayerSnapshotRow = {
  battle_id: string;
  roblox_id: string;
  username: string | null;
  points: number | string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBattleTitle(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Historical War";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d{4})$/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

async function getLinkedRobloxIds() {
  const ids = new Set<string>();

  const users = await pool.query<{ roblox_id: string | null }>(
    `SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id
     FROM users
     WHERE roblox_id IS NOT NULL
       AND TRIM(CAST(roblox_id AS TEXT)) <> ''`
  );
  for (const row of users.rows) if (row.roblox_id) ids.add(String(row.roblox_id));

  if (await tableExists("user_alts")) {
    const alts = await pool.query<{ roblox_id: string | null }>(
      `SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id
       FROM user_alts
       WHERE roblox_id IS NOT NULL
         AND TRIM(CAST(roblox_id AS TEXT)) <> ''`
    );
    for (const row of alts.rows) if (row.roblox_id) ids.add(String(row.roblox_id));
  }

  return ids;
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    if (!(await tableExists("battles"))) {
      return NextResponse.json({ success: true, featured: null, reports: [] });
    }

    const battles = await pool.query<BattleRow>(
      `SELECT
         b.battle_id,
         b.battle_name,
         b.start_time,
         b.end_time,
         ws.rank AS final_rank,
         ws.battle_points AS final_points,
         ws.captured_at
       FROM battles b
       LEFT JOIN LATERAL (
         SELECT rank, battle_points, captured_at
         FROM war_snapshots
         WHERE battle_id = b.battle_id
           AND LOWER(clan_name) = LOWER($1)
         ORDER BY captured_at DESC
         LIMIT 1
       ) ws ON TRUE
       WHERE b.end_time IS NOT NULL
         AND b.end_time <= NOW()
       ORDER BY b.end_time DESC NULLS LAST, ws.captured_at DESC NULLS LAST
       LIMIT 100`,
      [CLAN_NAME]
    );

    const battleIds = battles.rows.map((row) => row.battle_id);
    const linkedIds = await getLinkedRobloxIds();
    const byBattle = new Map<string, PlayerSnapshotRow[]>();

    if (battleIds.length && (await tableExists("player_leaderboard_history"))) {
      const players = await pool.query<PlayerSnapshotRow>(
        `SELECT DISTINCT ON (battle_id, roblox_id)
           battle_id,
           roblox_id::text AS roblox_id,
           username,
           points
         FROM player_leaderboard_history
         WHERE battle_id = ANY($1)
           AND points IS NOT NULL
         ORDER BY battle_id, roblox_id, captured_at DESC`,
        [battleIds]
      );

      for (const row of players.rows) {
        if (!linkedIds.has(String(row.roblox_id))) continue;
        const list = byBattle.get(row.battle_id) ?? [];
        list.push(row);
        byBattle.set(row.battle_id, list);
      }
    }

    const reports = battles.rows.map((battle) => {
      const rows = byBattle.get(battle.battle_id) ?? [];
      const points = rows.map((row) => asNumber(row.points));
      const positive = points.filter((value) => value > 0);
      const top = [...rows]
        .sort((a, b) => asNumber(b.points) - asNumber(a.points))
        .slice(0, 3)
        .map((row) => ({ robloxId: row.roblox_id, username: row.username ?? row.roblox_id, points: asNumber(row.points) }));

      return {
        battleId: battle.battle_id,
        battleName: formatBattleTitle(battle.battle_name || battle.battle_id),
        startTime: toIso(battle.start_time),
        endTime: toIso(battle.end_time),
        finalRank: battle.final_rank === null ? null : asNumber(battle.final_rank),
        finalPoints: asNumber(battle.final_points),
        capturedAt: toIso(battle.captured_at),
        accounts: rows.length,
        participants: positive.length,
        zeroAccounts: rows.filter((row) => asNumber(row.points) <= 0).length,
        averagePoints: points.length ? Math.round(points.reduce((sum, value) => sum + value, 0) / points.length) : 0,
        medianPoints: Math.round(median(points)),
        topMembers: top,
      };
    });

    return NextResponse.json({
      success: true,
      featured: reports[0] ?? null,
      reports,
    });
  } catch (err) {
    console.error("[war-reports] list error:", err);
    return NextResponse.json({ success: false, error: "Failed to load war reports" }, { status: 500 });
  }
}
