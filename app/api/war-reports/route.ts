import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const CLAN_API = process.env.CLAN_API ?? `${PS99_API}/api/clan/${encodeURIComponent(CLAN_NAME)}`;
const LEGACY_CLAN_API = `${PS99_API}/api/clan/${encodeURIComponent(CLAN_NAME)}`;

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
  /** true when the player was still in the clan during that battle's final
   * 3 hours — i.e. part of the end-of-war group. A window (not one exact
   * batch) because the bot and the site snapshot at different cadences. */
  in_final: boolean;
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

async function fetchRobloxNames(userIds: string[]) {
  const ids = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const names = new Map<string, string>();

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    try {
      const res = await fetch("https://users.roblox.com/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "MCWV-Hub/1.0" },
        body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false }),
        cache: "no-store",
      });

      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const rows = Array.isArray(json?.data) ? json.data : [];
      for (const row of rows) {
        const id = row?.id;
        const name = row?.name ?? row?.displayName;
        if (id !== null && id !== undefined && typeof name === "string" && name.trim()) {
          names.set(String(id), name.trim());
        }
      }
    } catch {
      // Keep numeric fallback.
    }
  }

  return names;
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

async function getClanBattleReportData(battleId: string, includeCurrentRoster: boolean) {
  // Live reports use the current in-game roster (Members + Owner). Completed
  // reports use the historical PointContributions list so old wars only show
  // people who were actually in that war, not today's clan roster.
  const json = (await fetchJsonOrNull(LEGACY_CLAN_API)) ?? (await fetchJsonOrNull(CLAN_API));
  const data = json?.data ?? {};
  const members = Array.isArray(data?.Members) ? data.Members : [];
  const currentMemberIds = new Set<string>();

  const ownerIdRaw = data?.Owner ?? data?.owner ?? data?.OwnerUserID ?? data?.ownerUserId;
  const ownerId = ownerIdRaw !== null && ownerIdRaw !== undefined && String(ownerIdRaw).trim()
    ? String(ownerIdRaw).trim()
    : null;

  if (ownerId) currentMemberIds.add(ownerId);

  for (const member of members) {
    const id = member?.UserID ?? member?.userId ?? member?.id;
    if (id !== null && id !== undefined && String(id).trim()) currentMemberIds.add(String(id).trim());
  }

  const battles = data?.Battles ?? data?.battles ?? {};
  const targetKey = normalizeBattleKey(battleId);
  const battle = Object.entries(battles).find(([key, value]) => {
    const record = value as Record<string, unknown>;
    const candidates = [key, record?.BattleID, record?.battleId, record?.configName, record?.Title, record?.title];
    return candidates.some((candidate) => normalizeBattleKey(candidate) === targetKey);
  })?.[1] as Record<string, unknown> | undefined;

  const contributionPoints = new Map<string, number>();
  const contributionIds = new Set<string>();
  const contributions = Array.isArray(battle?.PointContributions)
    ? battle.PointContributions
    : Array.isArray(battle?.pointContributions)
    ? battle.pointContributions
    : [];

  for (const contribution of contributions) {
    const entry = contribution as Record<string, unknown>;
    const id = entry?.UserID ?? entry?.userId ?? entry?.user_id;
    if (id === null || id === undefined || !String(id).trim()) continue;
    const normalizedId = String(id).trim();
    contributionIds.add(normalizedId);
    contributionPoints.set(normalizedId, asNumber(entry?.Points ?? entry?.points));
  }

  const memberIds = includeCurrentRoster
    ? new Set(currentMemberIds.size ? currentMemberIds : contributionIds)
    : new Set(contributionIds);

  // Big Games omits the clan owner from Members, so force include owner when
  // there is a live roster or historical battle contribution data.
  if (ownerId && (includeCurrentRoster || memberIds.size > 0)) memberIds.add(ownerId);

  return {
    memberIds,
    contributionPoints,
    battleFound: Boolean(battle),
    battlePoints: asNumber(battle?.Points ?? battle?.points),
    ownerId,
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

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const activeBattle = await getActiveBattleRow();

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
           OR (b.start_time IS NULL OR b.start_time <= NOW())
         )
       ORDER BY
         CASE WHEN b.end_time > NOW() THEN 0 ELSE 1 END,
         b.end_time DESC NULLS LAST,
         ws.captured_at DESC NULLS LAST
       LIMIT 100`,
      [CLAN_NAME]
    );

    const battleRows = [...battles.rows];
    if (activeBattle && !battleRows.some((row) => normalizeBattleKey(row.battle_id) === normalizeBattleKey(activeBattle.battle_id))) {
      battleRows.unshift(activeBattle);
    }

    const battleKeys = [...new Set(battleRows.map((row) => normalizeBattleKey(row.battle_id)).filter(Boolean))];
    const byBattle = new Map<string, PlayerSnapshotRow[]>();

    if (battleKeys.length && (await tableExists("player_leaderboard_history"))) {
      const players = await pool.query<PlayerSnapshotRow>(
        `SELECT DISTINCT ON (battle_key, roblox_id)
           battle_key,
           battle_id,
           roblox_id,
           username,
           points,
           (captured_at >= last_ts - INTERVAL '3 hours') AS in_final
         FROM (
           SELECT
             regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') AS battle_key,
             battle_id,
             roblox_id::text AS roblox_id,
             username,
             points,
             captured_at,
             MAX(captured_at) OVER (
               PARTITION BY regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g')
             ) AS last_ts
           FROM player_leaderboard_history
           WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = ANY($1)
             AND points IS NOT NULL
         ) rows
         ORDER BY battle_key, roblox_id, captured_at DESC`,
        [battleKeys]
      );

      for (const row of players.rows) {
        const list = byBattle.get(row.battle_key) ?? [];
        list.push(row);
        byBattle.set(row.battle_key, list);
      }
    }

    const clanDataByBattle = new Map<string, Awaited<ReturnType<typeof getClanBattleReportData>>>();
    const namesByBattle = new Map<string, Map<string, string>>();
    for (const battle of battleRows) {
      const key = normalizeBattleKey(battle.battle_id);
      const clanData = await getClanBattleReportData(battle.battle_id, Boolean(battle.is_active));
      if (clanData.memberIds.size > 0) {
        clanDataByBattle.set(key, clanData);
        namesByBattle.set(key, await fetchRobloxNames([...clanData.memberIds]));
      }
    }

    const reports = battleRows
      .map((battle) => {
        const battleKey = normalizeBattleKey(battle.battle_id);
        let rows = byBattle.get(battleKey) ?? [];
        const clanData = clanDataByBattle.get(battleKey);

        if (clanData && clanData.memberIds.size > 0) {
          const reportIds = [...clanData.memberIds];
          const names = namesByBattle.get(battleKey) ?? new Map<string, string>();
          const rowsById = new Map(rows.map((row) => [String(row.roblox_id), row]));
          const rosterIdSet = new Set(reportIds.map((id) => String(id)));
          const mappedRows = reportIds.map((robloxId) => {
            const existing = rowsById.get(robloxId);
            return {
              battle_key: battleKey,
              battle_id: battle.battle_id,
              roblox_id: robloxId,
              username: existing?.username ?? names.get(robloxId) ?? robloxId,
              points: clanData.contributionPoints.get(robloxId) ?? asNumber(existing?.points),
              in_final: existing?.in_final ?? false,
            };
          });
          // Union back players we snapshotted during this war who are missing
          // from the roster source. Live wars: anyone ever seen (kicked
          // members stay visible mid-war). Ended wars: only the war's final
          // snapshot — the roster exactly as it ended — so people who passed
          // through mid-war do not inflate the count.
          const departedRows = rows.filter(
            (row) => !rosterIdSet.has(String(row.roblox_id)) && (battle.is_active || row.in_final)
          );
          rows = [...mappedRows, ...departedRows];
        }

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
          finalPoints: battle.is_active
            ? points.reduce((sum, value) => sum + value, 0)
            : asNumber(battle.final_points) || clanData?.battlePoints || points.reduce((sum, value) => sum + value, 0),
          capturedAt: toIso(battle.captured_at),
          isActive: Boolean(battle.is_active),
          accounts: rows.length,
          participants: positive.length,
          zeroAccounts: rows.filter((row) => asNumber(row.points) <= 0).length,
          averagePoints: points.length ? Math.round(points.reduce((sum, value) => sum + value, 0) / points.length) : 0,
          medianPoints: Math.round(median(points)),
          topMembers: top,
        };
      })
      // Hide completed blank wars (for example Lunar before data collection started).
      // Keep live previews even if they are still warming up.
      .filter((report) => report.isActive || report.accounts > 0);

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
