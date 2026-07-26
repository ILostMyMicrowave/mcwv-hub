import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getDetectedWarWindow } from "@/lib/warDetection";

export const runtime = "nodejs";

const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const CLAN_API = process.env.CLAN_API ?? "";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const BIG_GAMES_INDEX_CLAN_URL = `https://db.biggames.io/clans/leaderboard?sort=Points&item=${encodeURIComponent(CLAN_NAME)}&tab=overview`;
const LEGACY_CLAN_URL = `${PS99_API}/api/clan/${encodeURIComponent(CLAN_NAME)}`;
const LEGACY_CLANS_LEADERBOARD_URL = `${PS99_API}/api/clans?page=1&pageSize=100&sort=Points&sortOrder=desc`;

type SnapshotRow = {
  battle_id: string;
  clan_name: string;
  captured_at: string | Date;
  rank: number | null;
  battle_points: number | null;
  participants: number | null;
  total_clans: number | null;
  total_points: number | null;
  progress_percent: number | null;
  found_in_sample: boolean | null;
};

type ClanHistoryRow = {
  battle_id: string;
  clan_name: string;
  rank: number | null;
  points: number | null;
  captured_at: string | Date;
};

type BattleRow = {
  battle_id: string;
  battle_name: string | null;
  start_time: string | Date | null;
  end_time: string | Date | null;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

function formatShortDuration(ms: number | null) {
  if (ms === null) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

function hourKey(date: Date) {
  return date.toISOString().slice(0, 13);
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function namesMatch(a: unknown, b: unknown): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

async function getLatestBattleId(): Promise<string | null> {
  if (!pool) return null;

  const res = await pool.query<{ battle_id: string }>(
    `SELECT battle_id
     FROM battles
     ORDER BY COALESCE(end_time, start_time, created_at, NOW()) DESC
     LIMIT 1`
  );

  return res.rows[0]?.battle_id ?? null;
}

async function getBattleMeta(battleId: string) {
  if (!pool) return null;

  const res = await pool.query<BattleRow>(
    `SELECT battle_id, battle_name, start_time, end_time
     FROM battles
     WHERE battle_id = $1
     LIMIT 1`,
    [battleId]
  );

  return res.rows[0] ?? null;
}

async function getLatestSnapshots(battleId: string) {
  if (!pool) return [];

  const res = await pool.query<SnapshotRow>(
    `SELECT battle_id, clan_name, captured_at, rank, battle_points, participants, total_clans, total_points, progress_percent, found_in_sample
     FROM war_snapshots
     WHERE battle_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [battleId]
  );

  return res.rows;
}

async function getSnapshotHistory(battleId: string, clanName: string, hours: number) {
  if (!pool) return [];

  const res = await pool.query<SnapshotRow>(
    `SELECT battle_id, clan_name, captured_at, rank, battle_points, participants, total_clans, total_points, progress_percent, found_in_sample
     FROM war_snapshots
     WHERE battle_id = $1
       AND LOWER(clan_name) = LOWER($2)
       AND captured_at >= NOW() - ($3 || ' hours')::interval
     ORDER BY captured_at ASC`,
    [battleId, clanName, hours]
  );

  return res.rows;
}

async function getClanHistoryWindow(battleId: string, clanName: string, hours: number) {
  if (!pool) return [];

  const res = await pool.query<ClanHistoryRow>(
    `SELECT battle_id, clan_name, rank, points, captured_at
     FROM clan_history
     WHERE battle_id = $1
       AND LOWER(clan_name) = LOWER($2)
       AND captured_at >= NOW() - ($3 || ' hours')::interval
     ORDER BY captured_at ASC`,
    [battleId, clanName, hours]
  );

  return res.rows;
}

async function getNearbyClans(battleId: string, snapshotTime: Date) {
  if (!pool) return [];

  const res = await pool.query<ClanHistoryRow>(
    `SELECT battle_id, clan_name, rank, points, captured_at
     FROM clan_history
     WHERE battle_id = $1
       AND captured_at = $2
     ORDER BY COALESCE(rank, 999999), points DESC, LOWER(clan_name) ASC`,
    [battleId, snapshotTime]
  );

  return res.rows;
}

function pickClosestAbove(rows: ClanHistoryRow[], ourRank: number | null, ourPoints: number) {
  if (ourRank !== null) {
    const above = rows
      .map((r) => ({
        rank: asNumber(r.rank),
        name: String(r.clan_name),
        points: asNumber(r.points) ?? 0,
      }))
      .filter((r) => r.rank !== null && (r.rank as number) < ourRank)
      .sort((a, b) => (b.rank ?? 999999) - (a.rank ?? 999999));

    return above[0] ?? null;
  }

  const byPoints = rows
    .map((r) => ({
      rank: asNumber(r.rank),
      name: String(r.clan_name),
      points: asNumber(r.points) ?? 0,
    }))
    .filter((r) => r.points > ourPoints)
    .sort((a, b) => a.points - b.points);

  return byPoints[0] ?? null;
}

function pickClosestBelow(rows: ClanHistoryRow[], ourRank: number | null, ourPoints: number) {
  if (ourRank !== null) {
    const below = rows
      .map((r) => ({
        rank: asNumber(r.rank),
        name: String(r.clan_name),
        points: asNumber(r.points) ?? 0,
      }))
      .filter((r) => r.rank !== null && (r.rank as number) > ourRank)
      .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));

    return below[0] ?? null;
  }

  const byPoints = rows
    .map((r) => ({
      rank: asNumber(r.rank),
      name: String(r.clan_name),
      points: asNumber(r.points) ?? 0,
    }))
    .filter((r) => r.points < ourPoints)
    .sort((a, b) => b.points - a.points);

  return byPoints[0] ?? null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ratePerHour(history: { capturedAt: Date; points: number }[]) {
  if (history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const hours = (last.capturedAt.getTime() - first.capturedAt.getTime()) / 3_600_000;
  if (hours <= 0) return null;

  return (last.points - first.points) / hours;
}

function projectEta(gap: number, netRatePerHour: number | null) {
  if (netRatePerHour === null || netRatePerHour <= 0) return null;
  return (gap / netRatePerHour) * 3_600_000;
}

function statusTone(projectedPlacement: number | null) {
  if (projectedPlacement === null) return "info" as const;
  if (projectedPlacement <= 30) return "success" as const;
  if (projectedPlacement <= 50) return "warning" as const;
  return "danger" as const;
}

function normalizeTimestamp(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed ${url}: HTTP ${res.status}`);
  return res.json();
}

type LiveWarInfo = {
  battleId: string;
  title: string;
  start: number;
  finish: number;
  progressPct: number | null;
};

type LiveContribution = {
  UserID?: number | string;
  Points?: number | string;
};

type LiveClanBattle = {
  BattleID?: string;
  Title?: string;
  configName?: string;
  Points?: number | string;
  PointContributions?: LiveContribution[];
};

async function getActiveWarInfo(): Promise<LiveWarInfo | null> {
  try {
    const active = await fetchJson(ACTIVE_BATTLE_API);
    const data = active?.data ?? {};
    const config = data?.configData ?? {};
    const start = normalizeTimestamp(config.StartTime);
    const finish = normalizeTimestamp(config.FinishTime);
    const now = Math.floor(Date.now() / 1000);
    const isActive = start > 0 && finish > 0 ? start <= now && now <= finish : Boolean(data.activeBattleConfigName ?? data.activeBattleId ?? data.battleId);

    if (!isActive) return null;

    const title = String(config.Title ?? config.configName ?? data.configName ?? data.activeBattleConfigName ?? data.activeBattleId ?? "Current Battle");
    const battleId = String(config._id ?? config.Title ?? data.configName ?? title);
    const detectedWindow = await getDetectedWarWindow({
      battleId,
      battleName: title,
      apiStart: start > 0 ? start : null,
      apiEnd: finish > 0 ? finish : null,
    });
    const detectedStart = detectedWindow?.start ? Math.floor(detectedWindow.start.getTime() / 1000) : start;
    const detectedFinish = detectedWindow?.end ? Math.floor(detectedWindow.end.getTime() / 1000) : finish;
    const progressPct = detectedStart > 0 && detectedFinish > detectedStart ? clamp(((Date.now() / 1000 - detectedStart) / (detectedFinish - detectedStart)) * 100, 0, 100) : null;

    return { battleId, title, start: detectedStart, finish: detectedFinish, progressPct };
  } catch (err) {
    console.warn("[war-analyst] active battle unavailable:", err);
    return null;
  }
}

async function getLiveClanBattle(active: LiveWarInfo) {
  if (!CLAN_API) return null;

  try {
    const clan = await fetchJson(CLAN_API);
    const battles = (clan?.data?.Battles ?? {}) as Record<string, LiveClanBattle>;
    const target = normalizeKey(active.title);
    const match = Object.entries(battles).find(([key, battle]) => {
      const names = [key, battle?.BattleID, battle?.Title, battle?.configName];
      return names.some((name) => normalizeKey(name) === target);
    });

    return match?.[1] ?? null;
  } catch (err) {
    console.warn("[war-analyst] live clan battle unavailable:", err);
    return null;
  }
}

async function getPublicBattle(active: LiveWarInfo) {
  const ids = [active.battleId, active.title].filter(Boolean);

  for (const id of ids) {
    try {
      const data = await fetchJson(`${PS99_API}/v1/clans/battles/${encodeURIComponent(id)}`);
      if (data?.data) return data.data;
    } catch {
      continue;
    }
  }

  return null;
}

async function getLegacyClanOverview(active: LiveWarInfo) {
  try {
    const payload = await fetchJson(LEGACY_CLAN_URL);
    const clan = payload?.data;
    const battles = (clan?.Battles ?? {}) as Record<string, LiveClanBattle & Record<string, unknown>>;
    const target = normalizeKey(active.title);
    const match = Object.entries(battles).find(([key, battle]) => {
      const names = [key, battle?.BattleID, battle?.Title, battle?.configName];
      return names.some((name) => normalizeKey(name) === target);
    });
    const battle = match?.[1] ?? null;

    return {
      rank: asNumber(battle?.Place ?? battle?.place ?? battle?.Rank ?? battle?.rank),
      points: asNumber(battle?.Points ?? battle?.points),
      participants: Array.isArray(battle?.PointContributions)
        ? battle.PointContributions.filter((entry) => contributionPoints(entry) > 0).length
        : null,
      membersCount: Array.isArray(clan?.Members) ? clan.Members.length : null,
      inactiveMembers: Array.isArray(battle?.PointContributions)
        ? battle.PointContributions.filter((entry) => contributionPoints(entry) <= 0).length
        : null,
      battle,
    };
  } catch (err) {
    console.warn("[war-analyst] legacy clan overview unavailable:", err);
    return null;
  }
}

async function getLegacyClansLeaderboard() {
  try {
    const payload = await fetchJson(LEGACY_CLANS_LEADERBOARD_URL);
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    return rows
      .map((row: Record<string, unknown>, index: number) => ({
        rank: index + 1,
        name: String(row.Name ?? row.name ?? "Unknown"),
        points: asNumber(row.Points ?? row.points) ?? 0,
      }))
      .filter((row: { name: string }) => row.name !== "Unknown");
  } catch (err) {
    console.warn("[war-analyst] legacy clans leaderboard unavailable:", err);
    return [];
  }
}

async function getBigGamesIndexClanOverview() {
  try {
    const res = await fetch(BIG_GAMES_INDEX_CLAN_URL, {
      cache: "no-store",
      headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "text/html" },
    });

    if (!res.ok) return null;

    const html = await res.text();
    const escapedMatch = html.match(/\\"BattleID\\",\\"Points\\",(\d+),\\"PointContributions\\",[\s\S]*?\\"Place\\",(\d+)/);
    const plainMatch = html.match(/"BattleID","Points",(\d+),"PointContributions",[\s\S]*?"Place",(\d+)/);
    const match = escapedMatch ?? plainMatch;

    if (!match) return null;

    return {
      points: Number(match[1]),
      rank: Number(match[2]),
    };
  } catch (err) {
    console.warn("[war-analyst] BIG Games Index overview unavailable:", err);
    return null;
  }
}

function contributionPoints(entry: LiveContribution) {
  return asNumber(entry.Points) ?? 0;
}

function rateForWindow(history: Array<{ capturedAt: Date; points: number }>, windowMs: number) {
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const cutoff = last.capturedAt.getTime() - windowMs;
  const first = history.find((row) => row.capturedAt.getTime() >= cutoff) ?? history[0];
  const hours = (last.capturedAt.getTime() - first.capturedAt.getTime()) / 3_600_000;
  if (hours <= 0) return null;
  return Math.max(0, (last.points - first.points) / hours);
}

function pointsAtTime(history: Array<{ capturedAt: Date; points: number }>, targetMs: number) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (targetMs < sorted[0].capturedAt.getTime()) return null;

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const currentMs = current.capturedAt.getTime();
    if (currentMs === targetMs) return current.points;

    const next = sorted[index + 1];
    if (!next) return current.points;

    const nextMs = next.capturedAt.getTime();
    if (currentMs <= targetMs && targetMs <= nextMs) {
      const span = nextMs - currentMs;
      if (span <= 0) return current.points;
      const ratio = (targetMs - currentMs) / span;
      return current.points + (next.points - current.points) * ratio;
    }
  }

  return sorted[sorted.length - 1].points;
}

function pointsGainedLast60Minutes(history: Array<{ capturedAt: Date; points: number }>) {
  if (history.length < 2) return 0;
  const sorted = [...history].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const latest = sorted[sorted.length - 1];
  const cutoff = latest.capturedAt.getTime() - 60 * 60 * 1000;
  const baseline = pointsAtTime(sorted, cutoff);
  if (baseline === null) return 0;
  return Math.max(0, Math.round(latest.points - baseline));
}

function weightedLiveRate(history: Array<{ capturedAt: Date; points: number }>, fallbackRate: number | null) {
  const windows = [
    { rate: rateForWindow(history, 30 * 60 * 1000), weight: 0.4 },
    { rate: rateForWindow(history, 60 * 60 * 1000), weight: 0.3 },
    { rate: rateForWindow(history, 3 * 60 * 60 * 1000), weight: 0.2 },
    { rate: ratePerHour(history) ?? fallbackRate, weight: 0.1 },
  ].filter((item): item is { rate: number; weight: number } => item.rate !== null && Number.isFinite(item.rate));

  if (!windows.length) return fallbackRate;
  const totalWeight = windows.reduce((sum, item) => sum + item.weight, 0);
  return windows.reduce((sum, item) => sum + item.rate * item.weight, 0) / totalWeight;
}

async function getClanRateMap(battleId: string) {
  const map = new Map<string, number>();

  try {
    const result = await pool.query<{ clan_name: string; points: number | string; captured_at: Date | string }>(
      `SELECT clan_name, points, captured_at
       FROM clan_history
       WHERE battle_id = $1
         AND captured_at >= NOW() - INTERVAL '2 hours'
       ORDER BY clan_name ASC, captured_at ASC`,
      [battleId]
    );

    const grouped = new Map<string, Array<{ capturedAt: Date; points: number }>>();
    for (const row of result.rows) {
      const key = normalizeName(row.clan_name);
      if (!key) continue;
      const capturedAt = toDate(row.captured_at) ?? new Date();
      const points = asNumber(row.points) ?? 0;
      const list = grouped.get(key) ?? [];
      list.push({ capturedAt, points });
      grouped.set(key, list);
    }

    for (const [key, history] of grouped.entries()) {
      const gained = pointsGainedLast60Minutes(history);
      if (gained > 0) map.set(key, gained);
    }
  } catch (err) {
    console.warn("[war-analyst] clan last-hour map unavailable:", err);
  }

  return map;
}

async function getDisconnectStats() {
  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.player_presence_events') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) return { events24h: 0, players24h: 0, events1h: 0 };

    const result = await pool.query<{ events_24h: string; players_24h: string; events_1h: string }>(
      `WITH roster AS (
         SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id FROM users WHERE roblox_id IS NOT NULL
         UNION
         SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id FROM user_alts WHERE roblox_id IS NOT NULL
       ), drops AS (
         SELECT p.roblox_id::text AS roblox_id, p.created_at
         FROM player_presence_events p
         JOIN roster r ON r.roblox_id = p.roblox_id::text
         WHERE p.created_at >= NOW() - INTERVAL '24 hours'
           AND LOWER(COALESCE(p.previous_status::text, '')) IN ('in_game', 'ingame', '2')
           AND LOWER(COALESCE(p.next_status::text, '')) IN ('offline', 'online', '0', '1')
       )
       SELECT
         COUNT(*)::text AS events_24h,
         COUNT(DISTINCT roblox_id)::text AS players_24h,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::text AS events_1h
       FROM drops`
    );

    const row = result.rows[0];
    return {
      events24h: Number(row?.events_24h ?? 0) || 0,
      players24h: Number(row?.players_24h ?? 0) || 0,
      events1h: Number(row?.events_1h ?? 0) || 0,
    };
  } catch {
    return { events24h: 0, players24h: 0, events1h: 0 };
  }
}

function reliabilityFromDisconnects(
  stats: { events24h: number; players24h: number; events1h: number },
  participants: number | null
) {
  const participantBase = Math.max(participants ?? 25, 1);
  const affectedRate = stats.players24h / participantBase;
  const recentRate = stats.events1h / participantBase;
  const eventNoise = stats.events24h / Math.max(participantBase * 8, 1);
  const penalty = clamp(affectedRate * 0.22 + recentRate * 0.18 + eventNoise * 0.10, 0, 0.35);
  return clamp(1 - penalty, 0.65, 1);
}

function confidenceFromInputs(snapshotCount: number, hasNearby: boolean, reliability: number) {
  let score = 0;
  if (snapshotCount >= 8) score += 45;
  else if (snapshotCount >= 4) score += 30;
  else if (snapshotCount >= 2) score += 15;

  if (hasNearby) score += 30;
  if (reliability >= 0.9) score += 20;
  else if (reliability >= 0.78) score += 10;

  if (score >= 70) return "high" as const;
  if (score >= 40) return "medium" as const;
  return "low" as const;
}

function projectedRankFromPoints(clans: Array<{ name: string; points: number }>, ourProjectedPoints: number) {
  return clans.filter((clan) => !namesMatch(clan.name, CLAN_NAME) && clan.points > ourProjectedPoints).length + 1;
}

type GapTrend = {
  currentGap: number;
  previousGap: number;
  changePer30m: number;
  etaMs: number | null;
  windowMinutes: number;
};

async function getGapTrend(params: {
  battleId: string;
  otherName: string | null | undefined;
  currentOurPoints: number;
  currentOtherPoints: number;
  mode: "target" | "threat";
  ourHistory: Array<{ capturedAt: Date; points: number }>;
}): Promise<GapTrend | null> {
  if (!params.otherName || params.ourHistory.length < 2) return null;

  const targetMs = Date.now() - 30 * 60 * 1000;
  const previousOur = [...params.ourHistory]
    .filter((row) => row.capturedAt.getTime() <= targetMs)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? params.ourHistory[0];

  if (!previousOur) return null;

  const otherRows = await getClanHistoryWindow(params.battleId, params.otherName, 3);
  const otherHistory = otherRows
    .map((row) => ({
      capturedAt: toDate(row.captured_at) ?? new Date(),
      points: asNumber(row.points) ?? 0,
    }))
    .filter((row) => row.points > 0)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  if (otherHistory.length < 2) return null;

  const previousOther = [...otherHistory]
    .filter((row) => row.capturedAt.getTime() <= targetMs)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? otherHistory[0];

  if (!previousOther) return null;

  const previousAt = Math.min(previousOur.capturedAt.getTime(), previousOther.capturedAt.getTime());
  const windowMs = Date.now() - previousAt;
  if (windowMs < 5 * 60 * 1000) return null;

  const currentGap = params.mode === "target"
    ? Math.max(0, params.currentOtherPoints - params.currentOurPoints)
    : Math.max(0, params.currentOurPoints - params.currentOtherPoints);
  const previousGap = params.mode === "target"
    ? Math.max(0, previousOther.points - previousOur.points)
    : Math.max(0, previousOur.points - previousOther.points);

  const changePer30m = (currentGap - previousGap) / windowMs * (30 * 60 * 1000);
  const etaMs = changePer30m < 0
    ? (currentGap / Math.max(-changePer30m, 1)) * 30 * 60 * 1000
    : null;

  return {
    currentGap,
    previousGap,
    changePer30m,
    etaMs,
    windowMinutes: Math.round(windowMs / 60_000),
  };
}

function gapTrendText(trend: GapTrend | null, mode: "target" | "threat") {
  if (!trend) return mode === "target" ? "Need more gap history." : "Need more threat history.";
  const amount = formatNumber(Math.round(Math.abs(trend.changePer30m)));
  if (trend.changePer30m < 0) {
    return mode === "target"
      ? `Gap is closing by ${amount} every 30 min.`
      : `They are catching us by ${amount} every 30 min.`;
  }
  if (trend.changePer30m > 0) {
    return mode === "target"
      ? `Gap is growing by ${amount} every 30 min.`
      : `They are not catching us right now. Gap grows ${amount} every 30 min.`;
  }
  return "Gap is basically unchanged right now.";
}

function raceEstimateText(trend: GapTrend | null, mode: "target" | "threat") {
  if (!trend) return "not enough gap history yet";
  const amount = formatNumber(Math.round(Math.abs(trend.changePer30m)));

  if (mode === "target") {
    if (trend.changePer30m < 0 && trend.etaMs !== null) return `about ${formatShortDuration(trend.etaMs)}`;
    if (trend.changePer30m > 0) return `not catching up right now (gap grows ${amount} every 30 min)`;
    return "gap is holding steady right now";
  }

  if (trend.changePer30m < 0 && trend.etaMs !== null) return `about ${formatShortDuration(trend.etaMs)}`;
  if (trend.changePer30m > 0) return `they are not catching us right now (gap grows ${amount} every 30 min)`;
  return "gap is holding steady right now";
}

async function saveLiveAnalyticsSnapshot(params: {
  active: LiveWarInfo;
  rank: number | null;
  points: number;
  participants: number | null;
  totalClans: number | null;
  totalPoints: number | null;
  progressPct: number | null;
  nearby: Array<{ rank: number | null; name: string; points: number }>;
}) {
  const client = await pool.connect();

  try {
    const latest = await client.query<{ captured_at: Date }>(
      `SELECT captured_at
       FROM war_snapshots
       WHERE battle_id = $1
         AND LOWER(clan_name) = LOWER($2)
       ORDER BY captured_at DESC
       LIMIT 1`,
      [params.active.battleId, CLAN_NAME]
    );

    const lastCapturedAt = latest.rows[0]?.captured_at?.getTime() ?? 0;
    if (lastCapturedAt && Date.now() - lastCapturedAt < 60_000) return false;

    const capturedAt = new Date();

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO battles (battle_id, battle_name, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (battle_id)
       DO UPDATE SET
         battle_name = COALESCE(EXCLUDED.battle_name, battles.battle_name),
         start_time = COALESCE(EXCLUDED.start_time, battles.start_time),
         end_time = COALESCE(EXCLUDED.end_time, battles.end_time)`,
      [
        params.active.battleId,
        params.active.title,
        params.active.start > 0 ? new Date(params.active.start * 1000) : null,
        params.active.finish > 0 ? new Date(params.active.finish * 1000) : null,
      ]
    );
    await client.query(
      `INSERT INTO war_snapshots (
        battle_id,
        clan_name,
        captured_at,
        rank,
        battle_points,
        participants,
        total_clans,
        total_points,
        progress_percent,
        found_in_sample
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
      [
        params.active.battleId,
        CLAN_NAME,
        capturedAt,
        params.rank,
        params.points,
        params.participants,
        params.totalClans,
        params.totalPoints,
        params.progressPct,
      ]
    );

    const uniqueNearby = params.nearby.filter(
      (clan, index, rows) => rows.findIndex((row) => namesMatch(row.name, clan.name)) === index
    );

    if (uniqueNearby.length) {
      const values: unknown[] = [];
      const placeholders = uniqueNearby.map((clan, index) => {
        const base = index * 5;
        values.push(params.active.battleId, clan.name, clan.rank, clan.points, capturedAt);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      }).join(", ");

      await client.query(
        `INSERT INTO clan_history (battle_id, clan_name, rank, points, captured_at)
         VALUES ${placeholders}`,
        values
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    console.warn("[war-analyst] live snapshot save failed:", err);
    return false;
  } finally {
    client.release();
  }
}

async function buildLiveBattleHq(active: LiveWarInfo) {
  const [liveBattle, publicBattle, indexOverview, legacyOverview, legacyLeaderboard] = await Promise.all([
    getLiveClanBattle(active),
    getPublicBattle(active),
    getBigGamesIndexClanOverview(),
    getLegacyClanOverview(active),
    getLegacyClansLeaderboard(),
  ]);

  const contributions = Array.isArray(liveBattle?.PointContributions)
    ? liveBattle.PointContributions.filter((entry): entry is LiveContribution => !!entry && typeof entry === "object")
    : [];
  const sourceCurrentPoints = legacyOverview?.points ?? indexOverview?.points ?? asNumber(liveBattle?.Points) ?? contributions.reduce((sum, entry) => sum + contributionPoints(entry), 0);
  const participants = legacyOverview?.participants ?? (contributions.filter((entry) => contributionPoints(entry) > 0).length || null);

  const topClans = Array.isArray(publicBattle?.topClans) ? publicBattle.topClans : [];
  const publicMcwv = topClans.find((clan: Record<string, unknown>) => namesMatch(clan?.name, CLAN_NAME)) ?? null;
  const totalClans = asNumber(publicBattle?.stats?.participatingClans) ?? (legacyLeaderboard.length || topClans.length || null);
  const totalPoints = asNumber(publicBattle?.stats?.totalClanPoints);

  const sampledPublicNearby: Array<{ rank: number | null; name: string; points: number }> = topClans
    .map((clan: Record<string, unknown>) => ({
      rank: asNumber(clan.rank ?? clan.reportedPlace ?? clan.place),
      name: String(clan.name ?? "Unknown"),
      points: asNumber(clan.points) ?? 0,
    }))
    .filter((clan: { name: string }) => clan.name !== "Unknown");

  const publicNearby: Array<{ rank: number | null; name: string; points: number }> = legacyLeaderboard.length
    ? legacyLeaderboard
    : sampledPublicNearby;

  const leaderboardMcwv = publicNearby.find((clan) => namesMatch(clan.name, CLAN_NAME)) ?? null;
  const currentPoints = leaderboardMcwv?.points ?? sourceCurrentPoints;
  const publicRank = asNumber(publicMcwv?.reportedPlace ?? publicMcwv?.rank ?? publicMcwv?.place);
  const liveRank = asNumber(
    liveBattle && "Rank" in liveBattle
      ? liveBattle.Rank
      : liveBattle && "rank" in liveBattle
      ? liveBattle.rank
      : liveBattle && "Place" in liveBattle
      ? liveBattle.Place
      : liveBattle && "place" in liveBattle
      ? liveBattle.place
      : null
  );
  const rank = leaderboardMcwv?.rank ?? legacyOverview?.rank ?? indexOverview?.rank ?? liveRank ?? publicRank;

  const nearbyWithUs = (leaderboardMcwv
    ? publicNearby
    : [
        ...publicNearby,
        {
          rank,
          name: CLAN_NAME,
          points: currentPoints,
        },
      ])
    .filter((clan, index, rows) => rows.findIndex((row) => namesMatch(row.name, clan.name)) === index)
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return b.points - a.points;
    });

  const ourIndex = nearbyWithUs.findIndex((clan) => namesMatch(clan.name, CLAN_NAME));
  const ourNearby = ourIndex >= 0
    ? nearbyWithUs.slice(Math.max(0, ourIndex - 6), ourIndex + 7)
    : nearbyWithUs.slice(0, 10);

  // Match the clan-race bot: target/threat are based on live point gaps, not rank labels.
  const above = nearbyWithUs
    .filter((clan) => !namesMatch(clan.name, CLAN_NAME) && clan.points > currentPoints)
    .sort((a, b) => a.points - b.points)[0] ?? null;
  const below = nearbyWithUs
    .filter((clan) => !namesMatch(clan.name, CLAN_NAME) && clan.points < currentPoints)
    .sort((a, b) => b.points - a.points)[0] ?? null;
  const gapAbove = above ? Math.max(0, above.points - currentPoints + 1) : null;
  const gapBelow = below ? Math.max(0, currentPoints - below.points + 1) : null;

  await saveLiveAnalyticsSnapshot({
    active,
    rank,
    points: currentPoints,
    participants,
    totalClans,
    totalPoints,
    progressPct: active.progressPct,
    nearby: nearbyWithUs,
  });

  const snapshotRows = await getSnapshotHistory(active.battleId, CLAN_NAME, 24);
  const snapshotHistory = snapshotRows
    .map((row) => ({
      capturedAt: toDate(row.captured_at) ?? new Date(),
      points: asNumber(row.battle_points) ?? 0,
      rank: asNumber(row.rank),
    }))
    .filter((row) => row.points > 0)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const now = new Date();
  const pointsHistory = [
    ...snapshotHistory,
    { capturedAt: now, points: currentPoints, rank },
  ].filter((row, index, rows) => index === rows.findIndex((candidate) => candidate.capturedAt.getTime() === row.capturedAt.getTime()));

  const clanRateMap = await getClanRateMap(active.battleId);
  const clanRate = (name: string | null | undefined) => name ? clanRateMap.get(normalizeName(name)) ?? null : null;

  const elapsedHours = active.start > 0 ? Math.max(0.1, (Date.now() / 1000 - active.start) / 3600) : null;
  const remainingHours = active.finish > 0 ? Math.max(0, (active.finish - Date.now() / 1000) / 3600) : 0;
  const snapshotSpanMs = pointsHistory.length >= 2
    ? pointsHistory[pointsHistory.length - 1].capturedAt.getTime() - pointsHistory[0].capturedAt.getTime()
    : 0;
  // Do not run end-of-war placement projections until the data covers a real time window.
  // A lot of snapshots in the same few minutes is still not enough to forecast the whole war.
  const hasEnoughProjectionHistory = snapshotRows.length >= 10 && snapshotSpanMs >= 15 * 60 * 1000;
  const fallbackRate = hasEnoughProjectionHistory && elapsedHours ? currentPoints / elapsedHours : null;
  const rawHourlyRate = hasEnoughProjectionHistory ? weightedLiveRate(pointsHistory, fallbackRate) : null;
  const disconnectStats = await getDisconnectStats();
  const reliability = reliabilityFromDisconnects(disconnectStats, participants);
  const adjustedHourlyRate = rawHourlyRate === null ? null : rawHourlyRate * reliability;
  const preliminaryProjectedFinalPoints = adjustedHourlyRate === null ? null : currentPoints + adjustedHourlyRate * remainingHours;

  const aboveRate = hasEnoughProjectionHistory ? clanRate(above?.name) : null;
  const belowRate = hasEnoughProjectionHistory ? clanRate(below?.name) : null;

  const hasOpponentPace = aboveRate !== null || belowRate !== null;
  void hasOpponentPace;
  void preliminaryProjectedFinalPoints;

  const last24hPoints = pointsHistory.length >= 2 ? Math.max(0, pointsHistory[pointsHistory.length - 1].points - pointsHistory[0].points) : 0;
  const lastHourGain = pointsGainedLast60Minutes(pointsHistory);
  const [targetTrend, threatTrend] = await Promise.all([
    above ? getGapTrend({
      battleId: active.battleId,
      otherName: above.name,
      currentOurPoints: currentPoints,
      currentOtherPoints: above.points,
      mode: "target",
      ourHistory: pointsHistory,
    }) : Promise.resolve(null),
    below ? getGapTrend({
      battleId: active.battleId,
      otherName: below.name,
      currentOurPoints: currentPoints,
      currentOtherPoints: below.points,
      mode: "threat",
      ourHistory: pointsHistory,
    }) : Promise.resolve(null),
  ]);

  const etaAboveMs = targetTrend?.etaMs ?? null;
  const threatEtaMs = threatTrend?.etaMs ?? null;
  const passEstimateText = raceEstimateText(targetTrend, "target");
  const threatEstimateText = raceEstimateText(threatTrend, "threat");
  const remainingMs = remainingHours * 3_600_000;

  // Stable race forecast: use actual gap trends for the next position up/down.
  // Do not project all 100 clans to war end unless we have a mature model; it creates fake #1/#100 results.
  const oneHourClanProjection = nearbyWithUs.map((clan) => ({
    name: clan.name,
    points: clan.points + (namesMatch(clan.name, CLAN_NAME) ? lastHourGain : clanRate(clan.name) ?? 0),
  }));
  const oneHourExpectedPoints = currentPoints + lastHourGain;
  const oneHourBestPoints = currentPoints + Math.round(lastHourGain * 1.15);
  const oneHourWorstPoints = currentPoints + Math.round(lastHourGain * 0.85);
  const predictedRank1h = lastHourGain > 0 ? projectedRankFromPoints(oneHourClanProjection, oneHourExpectedPoints) : rank;
  const predictedBestRank1h = lastHourGain > 0 ? projectedRankFromPoints(oneHourClanProjection, oneHourBestPoints) : rank;
  const predictedWorstRank1h = lastHourGain > 0 ? projectedRankFromPoints(oneHourClanProjection, oneHourWorstPoints) : rank;

  const canPassTarget = rank !== null && etaAboveMs !== null && etaAboveMs > 0 && etaAboveMs <= remainingMs;
  const canBePassed = rank !== null && threatEtaMs !== null && threatEtaMs > 0 && threatEtaMs <= remainingMs;
  const projectedPlacement = predictedRank1h;
  const projectedBestPlacement = predictedBestRank1h;
  const projectedWorstPlacement = predictedWorstRank1h;
  const hasGapTrend = targetTrend !== null || threatTrend !== null;
  const hasActionableMovement = canPassTarget || canBePassed;
  const confidence = lastHourGain > 0 && hasGapTrend
    ? snapshotSpanMs >= 60 * 60 * 1000
      ? confidenceFromInputs(snapshotRows.length, nearbyWithUs.length > 1, reliability)
      : "medium" as const
    : "low" as const;
  const projectedFinalPoints = null;
  const inactiveMembers = legacyOverview?.inactiveMembers ?? (legacyOverview?.membersCount && participants !== null ? Math.max(0, legacyOverview.membersCount - participants) : null);
  const finishOutlookReady = snapshotSpanMs >= 60 * 60 * 1000 && clanRateMap.size >= 8 && adjustedHourlyRate !== null;
  const finishProjection = finishOutlookReady
    ? nearbyWithUs.map((clan) => {
        const rate = namesMatch(clan.name, CLAN_NAME) ? adjustedHourlyRate : clanRate(clan.name) ?? 0;
        return {
          name: clan.name,
          points: clan.points + rate * remainingHours,
        };
      })
    : [];
  const finishExpectedRank = finishOutlookReady ? projectedRankFromPoints(finishProjection, currentPoints + (adjustedHourlyRate ?? 0) * remainingHours) : null;
  const finishBestRank = finishOutlookReady ? projectedRankFromPoints(finishProjection, currentPoints + (adjustedHourlyRate ?? 0) * 1.18 * remainingHours) : null;
  const finishWorstRank = finishOutlookReady ? projectedRankFromPoints(finishProjection, currentPoints + (adjustedHourlyRate ?? 0) * 0.78 * remainingHours) : null;
  const finishProjectedPoints = finishOutlookReady ? Math.round(currentPoints + (adjustedHourlyRate ?? 0) * remainingHours) : null;
  const finishConfidence = finishOutlookReady
    ? confidenceFromInputs(snapshotRows.length, clanRateMap.size >= 8, reliability)
    : "warming_up" as const;

  const latestHistoryPoint = pointsHistory[pointsHistory.length - 1] ?? null;
  const latestHistoryMs = latestHistoryPoint?.capturedAt.getTime() ?? Date.now();
  const oneHourAgoPoints = pointsAtTime(pointsHistory, latestHistoryMs - 60 * 60 * 1000);
  const twoHoursAgoPoints = pointsAtTime(pointsHistory, latestHistoryMs - 2 * 60 * 60 * 1000);
  const previousHourGain = oneHourAgoPoints !== null && twoHoursAgoPoints !== null
    ? Math.max(0, Math.round(oneHourAgoPoints - twoHoursAgoPoints))
    : null;
  const momentum = previousHourGain === null
    ? "Need previous hour"
    : lastHourGain > previousHourGain * 1.1
    ? `Increasing vs previous hour (+${formatNumber(lastHourGain - previousHourGain)})`
    : lastHourGain < previousHourGain * 0.9
    ? `Decreasing vs previous hour (-${formatNumber(previousHourGain - lastHourGain)})`
    : "About the same as previous hour";
  const dataQuality = snapshotSpanMs >= 60 * 60 * 1000 && hasGapTrend
    ? "Strong"
    : snapshotSpanMs >= 15 * 60 * 1000 || hasGapTrend
    ? "Warming up"
    : "Early";
  const disconnectImpact = reliability >= 0.9 ? "Low" : reliability >= 0.75 ? "Medium" : "High";
  const recommendation = etaAboveMs !== null && etaAboveMs <= 30 * 60 * 1000 && above
    ? `Push now — ${above.name} is reachable in ${formatShortDuration(etaAboveMs)} if this gap trend holds.`
    : threatEtaMs !== null && threatEtaMs <= 30 * 60 * 1000 && below
    ? `Defend now — ${below.name} could catch us in ${formatShortDuration(threatEtaMs)} if nothing changes.`
    : targetTrend && targetTrend.changePer30m > 0 && above
    ? `${above.name} is close, but the gap is currently growing. We need a stronger push before the pass estimate improves.`
    : threatTrend && threatTrend.changePer30m > 0 && below
    ? `Hold pace — ${below.name} is not catching us right now.`
    : lastHourGain > 0
    ? `Keep pressure steady — MCWV gained ${formatNumber(lastHourGain)} points in the last 60 minutes.`
    : `Collecting race history — estimates will sharpen as more snapshots come in.`;
  const updateEveryMs = 30_000;
  const nextUpdateMs = updateEveryMs - (Date.now() % updateEveryMs);

  return {
    success: true,
    active: true,
    battleId: active.battleId,
    battleName: active.title,
    lastUpdatedAt: new Date().toISOString(),
    current: {
      clanName: CLAN_NAME,
      rank,
      points: currentPoints,
      level: null,
      kickCooldown: null,
      progressPct: active.progressPct,
      participants,
      totalClans,
      totalPoints,
    },
    stats: {
      gain24h: last24hPoints,
      pointsLastHour: lastHourGain,
      hourlyRate: rawHourlyRate,
      averageRate: rawHourlyRate,
      adjustedHourlyRate,
      reliability,
      disconnects24h: disconnectStats.events24h,
      disconnectPlayers24h: disconnectStats.players24h,
      disconnects1h: disconnectStats.events1h,
      inactiveMembers,
      projectedFinalPoints: projectedFinalPoints === null ? null : Math.round(projectedFinalPoints),
      projectedBestPlacement,
      projectedWorstPlacement,
      predictedRank1h,
      predictedBestRank1h,
      predictedWorstRank1h,
      gapAbove,
      gapBelow,
      targetName: above?.name ?? null,
      threatName: below?.name ?? null,
      targetGapTrendPer30m: targetTrend?.changePer30m ?? null,
      threatGapTrendPer30m: threatTrend?.changePer30m ?? null,
      passEstimateText,
      threatEstimateText,
      etaAboveMs,
      threatEtaMs,
      projectedPlacement,
      confidence,
      uiTone: statusTone(projectedPlacement),
    },
    nearby: (ourNearby.length ? ourNearby : [{ rank, name: CLAN_NAME, points: currentPoints }]).map((clan) => ({
      ...clan,
      pph: namesMatch(clan.name, CLAN_NAME) ? lastHourGain : clanRate(clan.name),
    })),
    summary: {
      overview: rank !== null ? `${CLAN_NAME} is currently #${rank} with ${formatNumber(currentPoints)} points.` : `${CLAN_NAME} has ${formatNumber(currentPoints)} battle points. Rank is not available yet.`,
      pace: lastHourGain > 0
        ? `MCWV gained ${formatNumber(lastHourGain)} points in the last 60 minutes.`
        : `Need a full 60 minutes of snapshot history before last-hour gain is available.`,
      target: gapAbove !== null && above
        ? `To pass ${above.name}`
        : `No next target could be resolved yet.`,
      threat: gapBelow !== null && below
        ? `${below.name} needs ${formatNumber(gapBelow)} points to pass us`
        : `No close threat from below could be resolved yet.`,
      recommendation,
      dataQuality,
      momentum,
      disconnectImpact,
    },
    finishOutlook: {
      ready: finishOutlookReady,
      expectedRank: finishExpectedRank,
      bestRank: finishBestRank,
      worstRank: finishWorstRank,
      projectedPoints: finishProjectedPoints,
      confidence: finishConfidence,
      reason: finishOutlookReady
        ? `Based on ${formatNumber(clanRateMap.size)} clan pace tracks and ${formatShortDuration(remainingMs)} remaining.`
        : `Warming up — needs at least 1 hour of snapshots and nearby clan pace history.`,
    },
    timing: {
      snapshotIntervalMs: updateEveryMs,
      nextUpdateInMs: nextUpdateMs,
      nextUpdateText: formatShortDuration(nextUpdateMs),
    },
    history: {
      points24h: pointsHistory.map((row) => ({
        capturedAt: row.capturedAt.toISOString(),
        points: row.points,
        rank: row.rank,
      })),
    },
    diagnostics: {
      snapshotsAvailable: snapshotRows.length,
      latestSnapshotRank: rank,
    },
  };
}

export async function GET() {
  try {
    if (!pool) {
      return NextResponse.json(
        {
          success: false,
          error: "Database not configured",
        },
        { status: 500 }
      );
    }

    const activeWar = await getActiveWarInfo();
    if (activeWar) {
      const livePayload = await buildLiveBattleHq(activeWar);
      return NextResponse.json(livePayload, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const battleId = await getLatestBattleId();

    if (!battleId) {
      return NextResponse.json({
        success: true,
        active: false,
        battleId: null,
        battleName: null,
        current: null,
        summary: "No saved battle snapshots yet.",
      });
    }

    const meta = await getBattleMeta(battleId);
    const latestRows = await getLatestSnapshots(battleId);
    const latest = latestRows[0] ?? null;

    if (!latest) {
      return NextResponse.json({
        success: true,
        active: false,
        battleId,
        battleName: meta?.battle_name ?? null,
        current: null,
        summary: "No snapshot rows available yet.",
      });
    }

    const snapshotTime = toDate(latest.captured_at) ?? new Date();
    const ourHistory = await getSnapshotHistory(battleId, CLAN_NAME, 24);
    const ourClanRows = await getClanHistoryWindow(battleId, CLAN_NAME, 24);
    const nearbyRows = await getNearbyClans(battleId, snapshotTime);

    const currentRank = asNumber(latest.rank);
    const currentPoints = asNumber(latest.battle_points) ?? 0;
    const currentTotalClans = asNumber(latest.total_clans);
    const currentTotalPoints = asNumber(latest.total_points);
    const currentParticipants = asNumber(latest.participants);
    const currentProgress = asNumber(latest.progress_percent);

    const last24hPoints =
      ourHistory.length >= 2
        ? (asNumber(ourHistory[ourHistory.length - 1]?.battle_points) ?? 0) -
          (asNumber(ourHistory[0]?.battle_points) ?? 0)
        : 0;

    const pointsHistory = ourHistory
      .map((row) => ({
        capturedAt: toDate(row.captured_at) ?? snapshotTime,
        points: asNumber(row.battle_points) ?? 0,
      }))
      .filter((row) => Number.isFinite(row.points))
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

    const hourlyRate = ratePerHour(pointsHistory);
    const avgRate = average(
      pointsHistory.length >= 2
        ? pointsHistory.slice(1).map((row, index) => {
            const prev = pointsHistory[index];
            const deltaPoints = row.points - prev.points;
            const deltaHours = (row.capturedAt.getTime() - prev.capturedAt.getTime()) / 3_600_000;
            return deltaHours > 0 ? deltaPoints / deltaHours : 0;
          })
        : []
    );

    const above = pickClosestAbove(nearbyRows, currentRank, currentPoints);
    const below = pickClosestBelow(nearbyRows, currentRank, currentPoints);

    const gapAbove =
      above && above.points > currentPoints ? above.points - currentPoints + 1 : null;
    const gapBelow =
      below && below.points < currentPoints ? currentPoints - below.points : null;

    const etaAboveMs = projectEta(gapAbove ?? 0, hourlyRate);
    const belowPressureRate =
      hourlyRate !== null && below
        ? (below.points - currentPoints) / 0.5
        : null;

    const threatEtaMs =
      below && gapBelow !== null && hourlyRate !== null
        ? projectEta(gapBelow, Math.max(0.1, hourlyRate - (avgRate ?? 0)))
        : null;

    const projectedPlacement =
      currentRank !== null
        ? currentRank
        : above
          ? (above.rank ?? null)
          : null;

    const confidence =
      ourHistory.length >= 6 ? "high" : ourHistory.length >= 3 ? "medium" : "low";

    const updateEveryMs = 5 * 60 * 1000;
    const nextUpdateMs = updateEveryMs - (Date.now() % updateEveryMs);

    const summaryParts = [
      currentRank !== null ? `${CLAN_NAME} is currently #${currentRank}.` : `${CLAN_NAME} rank is not available from the latest snapshot.`,
      `Battle points: ${formatNumber(currentPoints)}.`,
      last24hPoints ? `Last 24h gain: +${formatNumber(last24hPoints)}.` : `Last 24h gain is not available yet.`,
      gapAbove !== null && above ? `Need ${formatNumber(gapAbove)} more points to pass ${above.name}.` : `No clan above could be resolved yet.`,
      gapBelow !== null && below ? `Closest threat below is ${below.name}, trailing by ${formatNumber(gapBelow)} points.` : `No immediate threat below could be resolved yet.`,
    ];

    const overview = summaryParts.join(" ");

    const response = {
      success: true,
      active: true,
      battleId,
      battleName: meta?.battle_name ?? null,
      lastUpdatedAt: snapshotTime.toISOString(),
      current: {
        clanName: CLAN_NAME,
        rank: currentRank,
        points: currentPoints,
        level: null,
        kickCooldown: null,
        progressPct: currentProgress,
        participants: currentParticipants,
        totalClans: currentTotalClans,
        totalPoints: currentTotalPoints,
      },
      stats: {
        gain24h: last24hPoints,
        hourlyRate: hourlyRate,
        averageRate: avgRate,
        gapAbove,
        gapBelow,
        etaAboveMs,
        threatEtaMs,
        projectedPlacement,
        confidence,
        uiTone: statusTone(projectedPlacement),
      },
      nearby: nearbyRows.slice(0, 10).map((row) => ({
        rank: asNumber(row.rank),
        name: String(row.clan_name),
        points: asNumber(row.points) ?? 0,
      })),
      summary: {
        overview,
        pace:
          hourlyRate !== null
            ? `Current pace is ${formatNumber(Math.round(hourlyRate))} points/hour.`
            : `Current pace is not available yet.`,
        target:
          gapAbove !== null && above
            ? `${above.name} is the next clan to pass.`
            : `No next target could be resolved yet.`,
        threat:
          gapBelow !== null && below
            ? `${below.name} is the closest danger from below.`
            : `No close threat from below could be resolved yet.`,
      },
      timing: {
        snapshotIntervalMs: updateEveryMs,
        nextUpdateInMs: nextUpdateMs,
        nextUpdateText: formatShortDuration(nextUpdateMs),
      },
      history: {
        points24h: ourClanRows.map((row) => ({
          capturedAt: toDate(row.captured_at)?.toISOString() ?? null,
          points: asNumber(row.points) ?? 0,
          rank: asNumber(row.rank),
        })),
      },
      diagnostics: {
        snapshotsAvailable: ourHistory.length,
        latestSnapshotRank: currentRank,
      },
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Battle analyst failed",
      },
      { status: 500 }
    );
  }
      }
