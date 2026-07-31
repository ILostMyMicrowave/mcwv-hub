import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PointRow = {
  points_added: number | string;
  created_at: Date | string;
};

type SnapshotRow = {
  battle_id: string | null;
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

const CLAN_API = process.env.CLAN_API ?? "https://ps99.biggamesapi.io/api/clan/MCWV";

type ClanBattleContribution = {
  UserID?: number | string;
  Points?: number | string;
};

type ClanBattleRecord = {
  BattleID?: string;
  Title?: string;
  configName?: string;
  FinishTime?: number | string;
  EndTime?: number | string;
  PointContributions?: ClanBattleContribution[];
};

function normalizeBattleKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeTimestamp(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 1e12 ? Math.floor(parsed / 1000) : Math.floor(parsed);
}

function contributionPoints(entry: ClanBattleContribution) {
  return asNumber(entry.Points ?? 0);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${url}: HTTP ${res.status}`);
  return res.json();
}

async function getFrozenClanApiPoint(battleId: string, userId: number) {
  try {
    const targetKey = normalizeBattleKey(battleId);
    if (!targetKey) return null;

    const clan = await fetchJson(CLAN_API);
    const battles = (clan?.data?.Battles ?? {}) as Record<string, ClanBattleRecord>;
    const match = Object.entries(battles).find(([key, battle]) => {
      const candidates = [key, battle?.BattleID, battle?.configName, battle?.Title];
      return candidates.some((candidate) => normalizeBattleKey(candidate) === targetKey);
    });

    const battle = match?.[1];
    const contributions = Array.isArray(battle?.PointContributions)
      ? battle.PointContributions
          .filter((entry): entry is ClanBattleContribution => !!entry && typeof entry === "object")
          .sort((a, b) => contributionPoints(b) - contributionPoints(a))
      : [];

    const index = contributions.findIndex((entry) => String(entry.UserID ?? "") === String(userId));
    if (index < 0) return null;

    const finishSeconds = normalizeTimestamp(battle?.FinishTime ?? battle?.EndTime);
    const time = finishSeconds > 0
      ? new Date(finishSeconds * 1000).toISOString()
      : new Date().toISOString();

    return {
      time,
      points: contributionPoints(contributions[index]),
      rank: index + 1,
    };
  } catch (err) {
    console.warn("[leaderboard/player/history] frozen clan API fallback failed:", err);
    return null;
  }
}

function pointsAtTime(rows: SnapshotRow[], targetMs: number) {
  if (!rows.length) return null;

  const sorted = [...rows].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );

  const firstMs = new Date(sorted[0].captured_at).getTime();
  if (targetMs < firstMs) return null;

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const currentMs = new Date(current.captured_at).getTime();
    const currentPoints = asNumber(current.points);

    if (currentMs === targetMs) return currentPoints;

    const next = sorted[index + 1];
    if (!next) return currentPoints;

    const nextMs = new Date(next.captured_at).getTime();
    const nextPoints = asNumber(next.points);

    if (currentMs <= targetMs && targetMs <= nextMs) {
      const span = nextMs - currentMs;
      if (span <= 0) return currentPoints;
      const ratio = (targetMs - currentMs) / span;
      return currentPoints + (nextPoints - currentPoints) * ratio;
    }
  }

  return asNumber(sorted[sorted.length - 1].points);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ robloxId: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const { robloxId } = await params;
    const userId = Number(robloxId);
    const url = new URL(req.url);
    const requestedBattleId = url.searchParams.get("battle_id") ?? url.searchParams.get("battleId");
    const requestedBattleKey = normalizeBattleKey(requestedBattleId);
    const historicalMode = Boolean(requestedBattleKey);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid Roblox ID" }, { status: 400 });
    }

    const points: Array<{ time: string; value: number; delta?: number }> = [];
    const rank: Array<{ time: string; value: number }> = [];

    let change5m = 0;
    let pph = 0;

    const snapshotHistoryExists = await tableExists("player_leaderboard_history");

    if (snapshotHistoryExists) {
      let snapshotResult: { rows: SnapshotRow[] };
      if (historicalMode) {
        snapshotResult = await pool.query<SnapshotRow>(
          `SELECT battle_id, points, rank, pph, change_5m, captured_at
           FROM player_leaderboard_history
           WHERE roblox_id::text = $1
             AND regexp_replace(lower(COALESCE(battle_id, '')), '[^a-z0-9]+', '', 'g') = $2
             AND points IS NOT NULL
           ORDER BY captured_at ASC
           LIMIT 500`,
          [String(userId), requestedBattleKey]
        );
      } else {
        const latestBattleResult = await pool.query<{ battle_id: string | null }>(
          `SELECT battle_id
           FROM player_leaderboard_history
           WHERE roblox_id::text = $1
             AND points IS NOT NULL
           ORDER BY captured_at DESC
           LIMIT 1`,
          [String(userId)]
        );
        const latestBattleId = latestBattleResult.rows[0]?.battle_id ?? null;

        snapshotResult = await pool.query<SnapshotRow>(
          `SELECT battle_id, points, rank, pph, change_5m, captured_at
           FROM player_leaderboard_history
           WHERE roblox_id::text = $1
             AND battle_id IS NOT DISTINCT FROM $2::text
           ORDER BY captured_at ASC
           LIMIT 500`,
          [String(userId), latestBattleId]
        );
      }

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
        const latestPoints = asNumber(latest.points);
        const latestTimeMs = new Date(latest.captured_at).getTime();
        const fiveMinuteCutoff = latestTimeMs - 5 * 60 * 1000;
        const hourlyCutoff = latestTimeMs - 60 * 60 * 1000;
        const fiveMinuteBaseline = pointsAtTime(snapshotResult.rows, fiveMinuteCutoff);
        const hourlyBaseline = pointsAtTime(snapshotResult.rows, hourlyCutoff);

        change5m = fiveMinuteBaseline !== null ? Math.max(0, Math.round(latestPoints - fiveMinuteBaseline)) : 0;

        pph = hourlyBaseline !== null ? Math.max(0, Math.round(latestPoints - hourlyBaseline)) : 0;
      }
    }

    if (historicalMode && !points.length && requestedBattleId) {
      const frozenPoint = await getFrozenClanApiPoint(requestedBattleId, userId);
      if (frozenPoint) {
        points.push({ time: frozenPoint.time, value: frozenPoint.points, delta: 0 });
        rank.push({ time: frozenPoint.time, value: frozenPoint.rank });
      }
    }

    const pointHistoryExists = await tableExists("point_history");

    // Fallback for older installs before snapshot history existed. Do not use this
    // for historical wars; old wars should stay frozen to that battle only.
    if (!historicalMode && !points.length && pointHistoryExists) {
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

    if (!historicalMode && presenceEventsExists) {
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
      battleId: requestedBattleId ?? null,
      frozen: historicalMode,
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
