import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;

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
  battle_key: string;
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

function toDateFromTimestamp(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const ms = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBattleKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function fetchJsonOrNull(url: string) {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

async function getActiveBattleRow(): Promise<(BattleRow & { is_active: boolean }) | null> {
  const [v1, legacy] = await Promise.all([
    fetchJsonOrNull(`${PS99_API}/v1/clans/players`),
    fetchJsonOrNull(ACTIVE_BATTLE_API),
  ]);

  const legacyData = legacy?.data ?? {};
  const config = legacyData?.configData ?? {};
  const battleId =
    v1?.data?.activeBattleConfigName ??
    legacyData?.configName ??
    legacyData?.activeBattleConfigName ??
    legacyData?.activeBattleId ??
    legacyData?.battleId ??
    null;

  if (!battleId) return null;

  const start = toDateFromTimestamp(config?.StartTime ?? legacyData?.startTime ?? v1?.data?.startTime);
  const end = toDateFromTimestamp(config?.FinishTime ?? legacyData?.finishTime ?? v1?.data?.finishTime);
  const now = Date.now();
  const isActive = start && end ? start.getTime() <= now && now <= end.getTime() : true;
  if (!isActive) return null;

  return {
    battle_id: String(battleId),
    battle_name: String(config?.Title ?? legacyData?.title ?? battleId),
    start_time: start,
    end_time: end,
      final_rank: null,
      final_points: null,
      captured_at: null,
    is_active: true,
  };
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
    const canManage = auth.user.role === "officer" || auth.user.role === "owner";
    const activeBattle = canManage ? await getActiveBattleRow() : null;

    if (!(await tableExists("battles"))) {
      const rows = activeBattle ? [activeBattle] : [];
      const reports = rows.map((battle) => ({
        battleId: battle.battle_id,
        battleName: formatBattleTitle(battle.battle_name || battle.battle_id),
        startTime: toIso(battle.start_time),
        endTime: toIso(battle.end_time),
        finalRank: null,
        finalPoints: 0,
        capturedAt: null,
        isActive: true,
        accounts: 0,
        participants: 0,
        zeroAccounts: 0,
        averagePoints: 0,
        medianPoints: 0,
        topMembers: [],
      }));

      return NextResponse.json({ success: true, featured: reports[0] ?? null, reports });
    }

    const battles = await pool.query<BattleRow & { is_active: boolean }>(
      `SELECT
         b.battle_id,
         b.battle_name,
         b.start_time,
         b.end_time,
         (b.end_time IS NOT NULL AND b.end_time > NOW()) AS is_active,
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
         AND (
           b.end_time <= NOW()
           OR ($2::boolean = TRUE AND (b.start_time IS NULL OR b.start_time <= NOW()))
         )
       ORDER BY
         CASE WHEN b.end_time > NOW() THEN 0 ELSE 1 END,
         b.end_time DESC NULLS LAST,
         ws.captured_at DESC NULLS LAST
       LIMIT 100`,
      [CLAN_NAME, canManage]
    );

    const battleRows = [...battles.rows];
    if (activeBattle && !battleRows.some((row) => normalizeBattleKey(row.battle_id) === normalizeBattleKey(activeBattle.battle_id))) {
      battleRows.unshift(activeBattle);
    }

    const battleKeys = [...new Set(battleRows.map((row) => normalizeBattleKey(row.battle_id)).filter(Boolean))];
    const linkedIds = await getLinkedRobloxIds();
    const byBattle = new Map<string, PlayerSnapshotRow[]>();

    if (battleKeys.length && (await tableExists("player_leaderboard_history"))) {
      const players = await pool.query<PlayerSnapshotRow>(
        `SELECT DISTINCT ON (battle_key, roblox_id)
           battle_key,
           battle_id,
           roblox_id,
           username,
           points
         FROM (
           SELECT
             regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') AS battle_key,
             battle_id,
             roblox_id::text AS roblox_id,
             username,
             points,
             captured_at
           FROM player_leaderboard_history
           WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = ANY($1)
             AND points IS NOT NULL
         ) rows
         ORDER BY battle_key, roblox_id, captured_at DESC`,
        [battleKeys]
      );

      for (const row of players.rows) {
        if (!linkedIds.has(String(row.roblox_id))) continue;
        const list = byBattle.get(row.battle_key) ?? [];
        list.push(row);
        byBattle.set(row.battle_key, list);
      }
    }

    const reports = battleRows.map((battle) => {
      const rows = byBattle.get(normalizeBattleKey(battle.battle_id)) ?? [];
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
        isActive: Boolean(battle.is_active),
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
