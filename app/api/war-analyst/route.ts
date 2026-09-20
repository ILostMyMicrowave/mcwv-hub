import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireAuthenticatedUser } from "@/lib/authUser";
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

// ─────────────────────────────────────────────────────────────────────────────
// Performance architecture (rewritten 20 Sep).
//
// Why the old page was slow: every request ran 5 external API calls (one of
// them regex-mining a full HTML leaderboard page), a DB transaction on the
// read path, and 5-6 further DB queries, with zero caching. During pooler
// waves each of those could ride a 10-90s connect ladder.
//
// Now:
//   1. The ENTIRE payload is cached per-isolate for 45s with single-flight
//      dedup. The page polls every 30s; the data changes at snapshot cadence
//      (30-60s), so 45s is always fresh enough. First load pays the compute;
//      every other load is instant.
//   2. Every external fetch has an AbortController timeout and degrades
//      gracefully (the multi-source fallback chain already existed).
//   3. All clan rate/gap math runs off ONE consolidated clan_history query
//      instead of one query per clan per purpose.
//   4. The snapshot save (still self-throttled to 1/min) happens inside the
//      recompute, not on every request, and the pool is warm by then.
// ─────────────────────────────────────────────────────────────────────────────

const PAYLOAD_CACHE_TTL_MS = 45_000;
const ACTIVE_BATTLE_CACHE_TTL_MS = 30_000;
const LEADERBOARD_CACHE_TTL_MS = 90_000;
const INDEX_OVERVIEW_CACHE_TTL_MS = 5 * 60_000;
const DISCONNECT_STATS_CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 6_000;

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

type PointsPoint = { capturedAt: Date; points: number };

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

function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 2 }).format(value);
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

function clanIconUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const assetId = raw.match(/\d+/)?.[0];
  // Use the official image proxy. The db.biggames thumbnail route 403s for some clan icons.
  return assetId ? `${PS99_API}/image/${assetId}` : null;
}

// ── external fetches (timeout + per-source micro-caches) ───────────────────

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Failed ${url}: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

type MicroCache<T> = { value: T; at: number };

const microCaches = new Map<string, MicroCache<unknown>>();

async function cachedFetch<T>(cacheKey: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = microCaches.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await loader();
  microCaches.set(cacheKey, { value, at: Date.now() });
  return value;
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
    const active = await cachedFetch("active-battle", ACTIVE_BATTLE_CACHE_TTL_MS, () =>
      fetchJson(ACTIVE_BATTLE_API)
    );
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
    const payload = await cachedFetch("legacy-leaderboard", LEADERBOARD_CACHE_TTL_MS, () =>
      fetchJson(LEGACY_CLANS_LEADERBOARD_URL)
    );
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    return rows
      .map((row: Record<string, unknown>, index: number) => ({
        rank: index + 1,
        name: String(row.Name ?? row.name ?? "Unknown"),
        points: asNumber(row.Points ?? row.points) ?? 0,
        icon: clanIconUrl(row.Icon ?? row.icon),
      }))
      .filter((row: { name: string }) => row.name !== "Unknown");
  } catch (err) {
    console.warn("[war-analyst] legacy clans leaderboard unavailable:", err);
    return [];
  }
}

async function getBigGamesIndexClanOverview() {
  try {
    return await cachedFetch("index-overview", INDEX_OVERVIEW_CACHE_TTL_MS, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let html: string;
      try {
        const res = await fetch(BIG_GAMES_INDEX_CLAN_URL, {
          cache: "no-store",
          headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "text/html" },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        html = await res.text();
      } finally {
        clearTimeout(timer);
      }

      const escapedMatch = html.match(/\\"BattleID\\",\\"Points\\",(\d+),\\"PointContributions\\",[\s\S]*?\\"Place\\",(\d+)/);
      const plainMatch = html.match(/"BattleID","Points",(\d+),"PointContributions",[\s\S]*?"Place",(\d+)/);
      const match = escapedMatch ?? plainMatch;

      if (!match) return null;

      return { points: Number(match[1]), rank: Number(match[2]) };
    });
  } catch (err) {
    console.warn("[war-analyst] BIG Games Index overview unavailable:", err);
    return null;
  }
}

function contributionPoints(entry: LiveContribution) {
  return asNumber(entry.Points) ?? 0;
}

// ── database reads ──────────────────────────────────────────────────────────

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

// ONE consolidated fetch: recent clan_history for EVERY clan in the battle.
// Feeds the opponent rate map, the gap-trend regressions, and the nearby pph
// chips — previously three separate query patterns, now a single round trip.
async function getClanHistoriesWindow(
  battleId: string,
  hours: number
): Promise<Map<string, Array<{ capturedAt: Date; points: number; rank: number | null }>>> {
  const grouped = new Map<string, Array<{ capturedAt: Date; points: number; rank: number | null }>>();
  if (!pool) return grouped;

  try {
    const res = await pool.query<ClanHistoryRow>(
      `SELECT clan_name, rank, points, captured_at
       FROM clan_history
       WHERE battle_id = $1
         AND captured_at >= NOW() - ($2 || ' hours')::interval
       ORDER BY captured_at ASC`,
      [battleId, hours]
    );

    for (const row of res.rows) {
      const key = normalizeName(row.clan_name);
      if (!key) continue;
      const capturedAt = toDate(row.captured_at);
      if (!capturedAt) continue;
      const list = grouped.get(key) ?? [];
      list.push({ capturedAt, points: asNumber(row.points) ?? 0, rank: asNumber(row.rank) });
      grouped.set(key, list);
    }
  } catch (err) {
    console.warn("[war-analyst] consolidated clan history unavailable:", err);
  }

  return grouped;
}

// ── pace math (robust statistics) ───────────────────────────────────────────

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(percentileValue, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

type RobustRate = { rate: number | null; sigma: number | null };

/**
 * Median/MAD hourly rate over consecutive snapshot segments. Robust against
 * single glitch points (a bad sample can drag a mean forever; it can barely
 * move a median). Also returns the robust sigma so confidence bands are
 * data-driven instead of flat percentages.
 */
function robustHourlyRate(history: PointsPoint[]): RobustRate {
  const sorted = [...history]
    .filter((row) => Number.isFinite(row.points) && Number.isFinite(row.capturedAt.getTime()))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  if (sorted.length < 3) return { rate: null, sigma: null };

  const segmentRates: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const deltaPoints = current.points - previous.points;
    const deltaHours = (current.capturedAt.getTime() - previous.capturedAt.getTime()) / 3_600_000;
    if (deltaHours <= 0 || deltaHours > 0.75 || deltaPoints < 0) continue;
    segmentRates.push(deltaPoints / deltaHours);
  }

  if (segmentRates.length < 3) return { rate: null, sigma: null };

  const med = median(segmentRates);
  if (med === null || med <= 0) return { rate: null, sigma: null };

  const deviations = segmentRates.map((value) => Math.abs(value - med));
  const mad = median(deviations) ?? 0;
  const robustSigma = mad * 1.4826;
  const upperLimit = med + Math.max(robustSigma * 3, med * 0.5, 1_000);
  const filtered = segmentRates.filter((rate) => rate <= upperLimit);
  const source = filtered.length >= Math.max(2, Math.floor(segmentRates.length * 0.5)) ? filtered : segmentRates;
  return {
    rate: Math.max(0, source.reduce((sum, value) => sum + value, 0) / source.length),
    sigma: robustSigma,
  };
}

function safeProjectionHourlyGain(rawGain: number | null | undefined, robustRate: RobustRate, peerRates: number[]) {
  const raw = Math.max(0, Number(rawGain ?? 0));
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  let safe = raw;

  // Glitch guard. The thresholds are RELATIVE on purpose: this war runs at
  // hundreds of millions of points per hour, and the original absolute
  // constants (> 2,000 points) fired on every legitimate hot hour, silently
  // flooring real gains down to the 3h median (observed live: a 974M/h hour
  // displayed as a 306M/h "adjusted pace"). Only tame extreme spikes —
  // 2.5x+ the robust median AND at least half again above it — which is
  // still enough to catch duplicated-snapshot glitches (those spike 10x+).
  if (robustRate.rate !== null && robustRate.rate > 0) {
    const spikeFloor = Math.max(50_000, robustRate.rate * 0.5);
    if (raw > robustRate.rate * 2.5 && raw - robustRate.rate > spikeFloor) {
      safe = robustRate.rate;
    }
  }

  const positivePeers = peerRates.filter((value) => Number.isFinite(value) && value > 0);
  if (positivePeers.length >= 4) {
    const p75 = percentile(positivePeers, 0.75) ?? 0;
    const med = median(positivePeers) ?? 0;
    const peerCeiling = Math.max(p75 * 1.45, med * 1.65, 1_000);
    if (safe > peerCeiling && safe - peerCeiling > Math.max(50_000, peerCeiling * 0.1)) {
      safe = peerCeiling;
    }
  }

  return Math.max(0, Math.round(safe));
}

function pointsAtTime(history: PointsPoint[], targetMs: number) {
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

function pointsGainedLast60Minutes(history: PointsPoint[]) {
  if (history.length < 2) return 0;
  const sorted = [...history].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const latest = sorted[sorted.length - 1];
  const cutoff = latest.capturedAt.getTime() - 60 * 60 * 1000;
  const baseline = pointsAtTime(sorted, cutoff);
  if (baseline === null) return 0;
  return Math.max(0, Math.round(latest.points - baseline));
}

/**
 * Weighted live rate: 30m window carries the most weight, with 1h / 3h /
 * whole-history anchoring. An endpoint-slope on the short window is glitch
 * prone, so the 30m window is itself median-filtered first.
 */
function rateForWindow(history: PointsPoint[], windowMs: number) {
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const cutoff = last.capturedAt.getTime() - windowMs;
  const inWindow = history.filter((row) => row.capturedAt.getTime() >= cutoff);
  if (inWindow.length < 2) return null;
  const robust = robustHourlyRate(inWindow);
  if (robust.rate !== null) return robust.rate;
  const first = inWindow[0];
  const hours = (last.capturedAt.getTime() - first.capturedAt.getTime()) / 3_600_000;
  if (hours <= 0) return null;
  return Math.max(0, (last.points - first.points) / hours);
}

function ratePerHour(history: PointsPoint[]) {
  if (history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const hours = (last.capturedAt.getTime() - first.capturedAt.getTime()) / 3_600_000;
  if (hours <= 0) return null;

  return (last.points - first.points) / hours;
}

function weightedLiveRate(history: PointsPoint[], fallbackRate: number | null) {
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

// ── gap trend via least-squares regression ──────────────────────────────────
//
// The old model compared "now" with a single sample from 30 minutes ago: one
// glitchy snapshot flipped the trend text and the ETA. Now the gap series over
// the last ~2h is fitted with a least-squares slope, which needs at least 3
// samples and is stable against single bad points.

type GapTrend = {
  currentGap: number;
  changePer30m: number;
  etaMs: number | null;
  samples: number;
  windowMinutes: number;
};

function gapTrendFromHistories(
  ourHistory: PointsPoint[],
  otherHistory: PointsPoint[],
  mode: "target" | "threat"
): GapTrend | null {
  if (ourHistory.length < 2 || otherHistory.length < 2) return null;

  const now = Date.now();
  const windowStart = now - 2 * 60 * 60 * 1000;
  const samples: Array<{ t: number; gap: number }> = [];

  for (const other of otherHistory) {
    const t = other.capturedAt.getTime();
    if (t < windowStart) continue;
    const ourPoints = pointsAtTime(ourHistory, t);
    if (ourPoints === null) continue;
    const gap = mode === "target" ? other.points - ourPoints : ourPoints - other.points;
    samples.push({ t, gap });
  }

  if (samples.length < 3) return null;

  samples.sort((a, b) => a.t - b.t);
  const currentGap = samples[samples.length - 1].gap;
  const windowMinutes = Math.round((samples[samples.length - 1].t - samples[0].t) / 60_000);
  if (windowMinutes < 5) return null;

  // least-squares slope of gap vs time (per ms)
  const n = samples.length;
  const sumT = samples.reduce((sum, s) => sum + s.t, 0);
  const sumGap = samples.reduce((sum, s) => sum + s.gap, 0);
  const sumTG = samples.reduce((sum, s) => sum + s.t * s.gap, 0);
  const sumTT = samples.reduce((sum, s) => sum + s.t * s.t, 0);
  const denominator = n * sumTT - sumT * sumT;
  if (denominator === 0) return null;
  const slopePerMs = (n * sumTG - sumT * sumGap) / denominator;
  const changePer30m = slopePerMs * 30 * 60 * 1000;

  const etaMs = changePer30m < 0 && currentGap > 0
    ? (currentGap / Math.max(-changePer30m, 1)) * 30 * 60 * 1000
    : currentGap <= 0
      ? 0
      : null;

  return { currentGap: Math.max(0, currentGap), changePer30m, etaMs, samples: n, windowMinutes };
}

function raceEstimateText(trend: GapTrend | null, mode: "target" | "threat", remainingMs: number | null) {
  if (!trend) return "not enough gap history yet";
  const amount = formatCompactNumber(Math.round(Math.abs(trend.changePer30m)));

  if (trend.etaMs === 0) return mode === "target" ? "passing them now" : "they are passing us now";

  if (trend.etaMs !== null) {
    if (remainingMs !== null && trend.etaMs > remainingMs) {
      return `about ${formatShortDuration(trend.etaMs)}, which is after the war ends`;
    }
    return `about ${formatShortDuration(trend.etaMs)}`;
  }
  if (trend.changePer30m > 0) return `not catching up right now (gap grows ${amount} every 30 min)`;
  return "gap is holding steady right now";
}

// ── reliability (disconnects) ───────────────────────────────────────────────

async function getDisconnectStats() {
  return cachedFetch("disconnect-stats", DISCONNECT_STATS_CACHE_TTL_MS, async () => {
    try {
      if (!pool) return { events24h: 0, players24h: 0, events1h: 0 };

      const exists = await pool.query<{ exists: boolean }>(
        `SELECT to_regclass('public.player_presence_events') IS NOT NULL AS exists`
      );
      if (!exists.rows[0]?.exists) return { events24h: 0, players24h: 0, events1h: 0 };

      const result = await pool.query<{ events_24h: string; players_24h: string; events_1h: string }>(
        `WITH roster AS (
           SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id
           FROM users
           WHERE roblox_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM mcwv_loa_records l
               WHERE l.active = TRUE AND l.roblox_id = TRIM(CAST(users.roblox_id AS TEXT))
             )
           UNION
           SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id
           FROM user_alts
           WHERE roblox_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM mcwv_loa_records l
               WHERE l.active = TRUE AND l.roblox_id = TRIM(CAST(user_alts.roblox_id AS TEXT))
             )
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
  });
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

// ── confidence + placement helpers ──────────────────────────────────────────

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

function statusTone(projectedPlacement: number | null) {
  if (projectedPlacement === null) return "info" as const;
  if (projectedPlacement <= 30) return "success" as const;
  if (projectedPlacement <= 50) return "warning" as const;
  return "danger" as const;
}

// ── snapshot save (self-throttled, inside the recompute) ────────────────────

// Acquiring a pooled client opens a NEW connection when this isolate's pool
// is cold — exactly the Vercel egress lottery. pool.query is retry-protected
// in lib/db, but raw client transactions bypass that wrapper, so retry the
// CONNECT itself. Inside the cached recompute the pool is already warm from
// the read queries, so this is normally instant.
const CONNECT_RETRY_DELAYS_MS = [1_000, 3_000, 5_000, 8_000];

async function connectWithRetry(): Promise<PoolClient> {
  if (!pool) throw new Error("database pool is not initialised");
  for (let attempt = 0; ; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      const delay = CONNECT_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw err;
      console.warn(
        `[war-analyst] pool connect attempt ${attempt + 1}/${CONNECT_RETRY_DELAYS_MS.length + 1} failed, retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
  const client = await connectWithRetry();

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
         end_time = COALESCE(EXCLUDED.end_time, battles.end_time)
       WHERE battles.manually_edited IS NOT TRUE`,
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

// ── the live payload builder ────────────────────────────────────────────────

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

  const sampledPublicNearby: Array<{ rank: number | null; name: string; points: number; icon?: string | null }> = topClans
    .map((clan: Record<string, unknown>) => ({
      rank: asNumber(clan.rank ?? clan.reportedPlace ?? clan.place),
      name: String(clan.name ?? "Unknown"),
      points: asNumber(clan.points) ?? 0,
      icon: clanIconUrl(clan.icon),
    }))
    .filter((clan: { name: string }) => clan.name !== "Unknown");

  const publicNearby: Array<{ rank: number | null; name: string; points: number; icon?: string | null }> = legacyLeaderboard.length
    ? legacyLeaderboard
    : sampledPublicNearby;

  const leaderboardMcwv = publicNearby.find((clan) => namesMatch(clan.name, CLAN_NAME)) ?? null;
  const currentPoints = leaderboardMcwv?.points ?? sourceCurrentPoints;
  const publicRank = asNumber(publicMcwv?.reportedPlace ?? publicMcwv?.rank ?? publicMcwv?.place);
  const liveBattleRecord = liveBattle as Record<string, unknown> | null;
  const liveRank = asNumber(liveBattleRecord?.Rank ?? liveBattleRecord?.Place ?? liveBattleRecord?.rank ?? liveBattleRecord?.place);
  const rank = leaderboardMcwv?.rank ?? legacyOverview?.rank ?? indexOverview?.rank ?? liveRank ?? publicRank;

  const nearbyWithUs = (leaderboardMcwv
    ? publicNearby
    : [
        ...publicNearby,
        {
          rank,
          name: CLAN_NAME,
          points: currentPoints,
          icon: null,
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

  // Save the analytics snapshot (self-throttled to one per minute) before the
  // history read so this recompute can see its own row.
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

  // Parallel reads: our 24h snapshots + every clan's 3h history + disconnects.
  const [snapshotRows, clanHistories, disconnectStats] = await Promise.all([
    getSnapshotHistory(active.battleId, CLAN_NAME, 24),
    getClanHistoriesWindow(active.battleId, 3),
    getDisconnectStats(),
  ]);

  const snapshotHistory = snapshotRows
    .map((row) => ({
      capturedAt: toDate(row.captured_at) ?? new Date(),
      points: asNumber(row.battle_points) ?? 0,
      rank: asNumber(row.rank),
    }))
    .filter((row) => row.points > 0)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const now = new Date();
  const latestSnapshotPoint = snapshotHistory[snapshotHistory.length - 1] ?? null;
  const shouldAppendLivePoint =
    !latestSnapshotPoint ||
    now.getTime() - latestSnapshotPoint.capturedAt.getTime() > 60_000 ||
    latestSnapshotPoint.points !== currentPoints ||
    latestSnapshotPoint.rank !== rank;

  const pointsHistory: Array<{ capturedAt: Date; points: number; rank: number | null }> = [
    ...snapshotHistory,
    ...(shouldAppendLivePoint ? [{ capturedAt: now, points: currentPoints, rank }] : []),
  ].filter((row, index, rows) => index === rows.findIndex((candidate) => candidate.capturedAt.getTime() === row.capturedAt.getTime()));

  const pointsOnly: PointsPoint[] = pointsHistory.map(({ capturedAt, points }) => ({ capturedAt, points }));

  // ── opponent pace tracks (robust, from the consolidated fetch) ───────────
  const rawPeerRates: number[] = [];
  for (const [key, history] of clanHistories.entries()) {
    if (namesMatch(key, CLAN_NAME)) continue;
    const gain = pointsGainedLast60Minutes(history);
    if (gain > 0) rawPeerRates.push(gain);
  }

  const clanRateMap = new Map<string, number>();
  const clanSigmaMap = new Map<string, number>();
  for (const [key, history] of clanHistories.entries()) {
    const robust = robustHourlyRate(history);
    const gained = safeProjectionHourlyGain(pointsGainedLast60Minutes(history), robust, rawPeerRates);
    if (gained > 0) clanRateMap.set(key, gained);
    if (robust.sigma !== null) clanSigmaMap.set(key, robust.sigma);
  }
  const clanRate = (name: string | null | undefined) => {
    if (!name) return null;
    const direct = clanRateMap.get(normalizeName(name));
    if (direct !== undefined) return direct;
    for (const [key, value] of clanRateMap.entries()) {
      if (namesMatch(key, name)) return value;
    }
    return null;
  };

  // ── our pace ──────────────────────────────────────────────────────────────
  const elapsedHours = active.start > 0 ? Math.max(0.1, (Date.now() / 1000 - active.start) / 3600) : null;
  const remainingHours = active.finish > 0 ? Math.max(0, (active.finish - Date.now() / 1000) / 3600) : 0;
  const remainingMs = remainingHours * 3_600_000;
  const snapshotSpanMs = pointsOnly.length >= 2
    ? pointsOnly[pointsOnly.length - 1].capturedAt.getTime() - pointsOnly[0].capturedAt.getTime()
    : 0;
  const hasEnoughProjectionHistory = snapshotRows.length >= 10 && snapshotSpanMs >= 15 * 60 * 1000;
  const fallbackRate = hasEnoughProjectionHistory && elapsedHours ? currentPoints / elapsedHours : null;
  const warAverageRate = elapsedHours && elapsedHours >= 1 ? currentPoints / elapsedHours : null;

  const peerRatesForProjection = [...clanRateMap.entries()]
    .filter(([key]) => !namesMatch(key, CLAN_NAME))
    .map(([, value]) => value);

  const ourRobust = robustHourlyRate(pointsOnly);
  const factualLastHourGain = pointsGainedLast60Minutes(pointsOnly);
  const projectionHourGain = safeProjectionHourlyGain(factualLastHourGain, ourRobust, peerRatesForProjection);
  const rawWeightedHourlyRate = hasEnoughProjectionHistory ? weightedLiveRate(pointsOnly, fallbackRate) : null;
  const rawHourlyRate = rawWeightedHourlyRate === null ? null : safeProjectionHourlyGain(rawWeightedHourlyRate, ourRobust, peerRatesForProjection);

  const reliability = reliabilityFromDisconnects(disconnectStats, participants);
  const adjustedHourlyRate = rawHourlyRate === null ? null : rawHourlyRate * reliability;

  // Variance-driven band instead of a flat ±15%: 80% interval from the robust
  // sigma of our own segment rates, clamped to a sane 8-25% of the gain.
  const bandPct = ourRobust.sigma !== null && projectionHourGain > 0
    ? clamp((1.2816 * ourRobust.sigma) / projectionHourGain, 0.08, 0.25)
    : 0.15;

  // ── gap trends (regression) ───────────────────────────────────────────────
  const ourPointsOnly: PointsPoint[] = pointsOnly;
  const targetTrend = above
    ? gapTrendFromHistories(ourPointsOnly, clanHistories.get(normalizeName(above.name)) ?? [], "target")
    : null;
  const threatTrend = below
    ? gapTrendFromHistories(ourPointsOnly, clanHistories.get(normalizeName(below.name)) ?? [], "threat")
    : null;

  const etaAboveMs = targetTrend?.etaMs ?? null;
  const threatEtaMs = threatTrend?.etaMs ?? null;
  const passEstimateText = raceEstimateText(targetTrend, "target", remainingMs);
  const threatEstimateText = raceEstimateText(threatTrend, "threat", remainingMs);

  // ── 1h forecast: everyone moves at their robust rate ──────────────────────
  const oneHourClanProjection = nearbyWithUs.map((clan) => ({
    name: clan.name,
    points: clan.points + (namesMatch(clan.name, CLAN_NAME) ? projectionHourGain : clanRate(clan.name) ?? 0),
  }));
  const oneHourExpectedPoints = currentPoints + projectionHourGain;
  const oneHourBestPoints = currentPoints + Math.round(projectionHourGain * (1 + bandPct));
  const oneHourWorstPoints = currentPoints + Math.round(projectionHourGain * (1 - bandPct));
  const predictedRank1h = projectionHourGain > 0 ? projectedRankFromPoints(oneHourClanProjection, oneHourExpectedPoints) : rank;
  const predictedBestRank1h = projectionHourGain > 0 ? projectedRankFromPoints(oneHourClanProjection, oneHourBestPoints) : rank;
  const predictedWorstRank1h = projectionHourGain > 0 ? projectedRankFromPoints(oneHourClanProjection, oneHourWorstPoints) : rank;

  const canPassTarget = rank !== null && etaAboveMs !== null && etaAboveMs > 0 && etaAboveMs <= remainingMs;
  const canBePassed = rank !== null && threatEtaMs !== null && threatEtaMs > 0 && threatEtaMs <= remainingMs;
  const projectedPlacement = predictedRank1h;
  const projectedBestPlacement = predictedBestRank1h;
  const projectedWorstPlacement = predictedWorstRank1h;
  const hasGapTrend = targetTrend !== null || threatTrend !== null;
  const confidence = factualLastHourGain > 0 && hasGapTrend
    ? snapshotSpanMs >= 60 * 60 * 1000
      ? confidenceFromInputs(snapshotRows.length, nearbyWithUs.length > 1, reliability)
      : "medium" as const
    : "low" as const;
  const inactiveMembers = legacyOverview?.inactiveMembers ?? (legacyOverview?.membersCount && participants !== null ? Math.max(0, legacyOverview.membersCount - participants) : null);

  // ── finish outlook: cohort mean-reversion + symmetric scenarios ───────────
  // Every clan — us included — regresses toward the cohort median pace as the
  // horizon grows. The earlier model blended OUR rate toward our whole-war
  // average (which includes the slow start) while leaving rivals at their
  // latest hourly rate; in an accelerating war that is structurally
  // pessimistic (live: the fastest clan nearby was forecast to fall 40
  // places). Scenarios then move everyone symmetrically.
  const positivePeerRates = peerRatesForProjection.filter((value) => Number.isFinite(value) && value > 0);
  const cohortMedianRate = median(positivePeerRates);
  const recentBlendWeight = cohortMedianRate !== null && cohortMedianRate > 0
    ? clamp(24 / (24 + remainingHours), 0.3, 1)
    : 1;
  const ourFinishBaseRate =
    projectionHourGain > 0
      ? projectionHourGain * reliability
      : adjustedHourlyRate ?? warAverageRate ?? 0;
  const projectionRate =
    cohortMedianRate !== null && cohortMedianRate > 0
      ? ourFinishBaseRate * recentBlendWeight + cohortMedianRate * (1 - recentBlendWeight)
      : ourFinishBaseRate;

  const opponentFinishRate = (name: string) => {
    const rate = clanRate(name) ?? 0;
    if (cohortMedianRate === null || cohortMedianRate <= 0 || rate <= 0) return rate;
    return rate * recentBlendWeight + cohortMedianRate * (1 - recentBlendWeight);
  };

  const finishOutlookReady =
    snapshotSpanMs >= 2 * 60 * 60 * 1000 &&
    clanRateMap.size >= 8 &&
    projectionRate !== null &&
    nearbyWithUs.length >= 6;

  const finishProjectedGain = finishOutlookReady && projectionRate !== null ? projectionRate * remainingHours : 0;
  const ourFinishExpected = currentPoints + finishProjectedGain;
  const ourFinishBest = currentPoints + finishProjectedGain * (1 + bandPct);
  const ourFinishWorst = currentPoints + finishProjectedGain * (1 - bandPct);

  const finishProjectionExpected = finishOutlookReady
    ? nearbyWithUs.map((clan) => ({
        name: clan.name,
        points: namesMatch(clan.name, CLAN_NAME)
          ? ourFinishExpected
          : clan.points + opponentFinishRate(clan.name) * remainingHours,
      }))
    : [];
  const finishProjectionBest = finishOutlookReady
    ? nearbyWithUs.map((clan) => ({
        name: clan.name,
        points: namesMatch(clan.name, CLAN_NAME)
          ? ourFinishBest
          : clan.points + opponentFinishRate(clan.name) * 0.9 * remainingHours,
      }))
    : [];
  const finishProjectionWorst = finishOutlookReady
    ? nearbyWithUs.map((clan) => ({
        name: clan.name,
        points: namesMatch(clan.name, CLAN_NAME)
          ? ourFinishWorst
          : clan.points + opponentFinishRate(clan.name) * 1.1 * remainingHours,
      }))
    : [];

  const finishExpectedRank = finishOutlookReady ? projectedRankFromPoints(finishProjectionExpected, ourFinishExpected) : rank;
  const finishBestRank = finishOutlookReady ? projectedRankFromPoints(finishProjectionBest, ourFinishBest) : null;
  const finishWorstRank = finishOutlookReady ? projectedRankFromPoints(finishProjectionWorst, ourFinishWorst) : null;
  const finishProjectedPoints = finishOutlookReady ? Math.round(ourFinishExpected) : null;
  const finishConfidence = finishOutlookReady
    ? snapshotSpanMs >= 4 * 60 * 60 * 1000 && clanRateMap.size >= 15
      ? confidenceFromInputs(snapshotRows.length, clanRateMap.size >= 15, reliability)
      : "low" as const
    : "warming_up" as const;

  // ── momentum + data quality ───────────────────────────────────────────────
  const lastHourGain = factualLastHourGain;
  const last24hPoints = pointsOnly.length >= 2 ? Math.max(0, pointsOnly[pointsOnly.length - 1].points - pointsOnly[0].points) : 0;
  const latestHistoryMs = pointsOnly[pointsOnly.length - 1]?.capturedAt.getTime() ?? Date.now();
  const oneHourAgoPoints = pointsAtTime(pointsOnly, latestHistoryMs - 60 * 60 * 1000);
  const twoHoursAgoPoints = pointsAtTime(pointsOnly, latestHistoryMs - 2 * 60 * 60 * 1000);
  const previousHourGain = oneHourAgoPoints !== null && twoHoursAgoPoints !== null
    ? Math.max(0, Math.round(oneHourAgoPoints - twoHoursAgoPoints))
    : null;
  const momentumPct = previousHourGain !== null && previousHourGain > 0
    ? Math.round(((lastHourGain - previousHourGain) / previousHourGain) * 100)
    : null;
  const momentum = previousHourGain === null
    ? "Need previous hour"
    : lastHourGain > previousHourGain * 1.1
    ? `Increasing vs previous hour (+${formatNumber(lastHourGain - previousHourGain)})`
    : lastHourGain < previousHourGain * 0.9
    ? `Decreasing vs previous hour (-${formatNumber(previousHourGain - lastHourGain)})`
    : "About the same as previous hour";

  const rateCoverage = nearbyWithUs.length
    ? Math.round((nearbyWithUs.filter((clan) => (clanRate(clan.name) ?? 0) > 0).length / nearbyWithUs.length) * 100)
    : 0;
  const dataQuality = snapshotSpanMs >= 60 * 60 * 1000 && hasGapTrend && rateCoverage >= 60
    ? "Strong"
    : snapshotSpanMs >= 15 * 60 * 1000 || hasGapTrend
    ? "Warming up"
    : "Early";
  const disconnectImpact = reliability >= 0.9 ? "Low" : reliability >= 0.75 ? "Medium" : "High";
  const recommendation = canPassTarget && etaAboveMs !== null && etaAboveMs <= 30 * 60 * 1000 && above
    ? `Push now — ${above.name} is reachable in ${formatShortDuration(etaAboveMs)} if this gap trend holds.`
    : canBePassed && threatEtaMs !== null && threatEtaMs <= 30 * 60 * 1000 && below
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

  const displayHistoryByMinute = new Map<string, { capturedAt: string; points: number; rank: number | null }>();
  for (const row of pointsHistory) {
    const capturedAt = row.capturedAt.toISOString();
    // The UI shows HH:mm, so keep only one row per displayed minute.
    displayHistoryByMinute.set(capturedAt.slice(0, 16), {
      capturedAt,
      points: row.points,
      rank: row.rank,
    });
  }
  const displayPointsHistory = [...displayHistoryByMinute.values()];

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
      previousHourGain,
      momentumPct,
      hourlyRate: rawHourlyRate,
      averageRate: rawHourlyRate,
      adjustedHourlyRate,
      warAverageRate: warAverageRate !== null ? Math.round(warAverageRate) : null,
      reliability,
      disconnects24h: disconnectStats.events24h,
      disconnectPlayers24h: disconnectStats.players24h,
      disconnects1h: disconnectStats.events1h,
      inactiveMembers,
      projectedBestPlacement,
      projectedWorstPlacement,
      predictedRank1h,
      predictedBestRank1h,
      predictedWorstRank1h,
      bandPct: Math.round(bandPct * 100),
      gapAbove,
      gapBelow,
      targetName: above?.name ?? null,
      threatName: below?.name ?? null,
      targetGapTrendPer30m: targetTrend?.changePer30m ?? null,
      threatGapTrendPer30m: threatTrend?.changePer30m ?? null,
      targetPph: above ? clanRate(above.name) : null,
      threatPph: below ? clanRate(below.name) : null,
      passEstimateText,
      threatEstimateText,
      etaAboveMs,
      threatEtaMs,
      canPassTarget,
      canBePassed,
      projectedPlacement,
      confidence,
      uiTone: statusTone(projectedPlacement),
    },
    nearby: (ourNearby.length ? ourNearby : [{ rank, name: CLAN_NAME, points: currentPoints, icon: null }]).map((clan) => ({
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
      trackedClans: clanRateMap.size,
      dataSpanHours: Math.round((snapshotSpanMs / 3_600_000) * 10) / 10,
      remainingHours: Math.round(remainingHours * 10) / 10,
      reason: finishOutlookReady
        ? `Based on ${formatNumber(clanRateMap.size)} clan pace tracks, ${formatShortDuration(remainingMs)} remaining.`
        : `Showing live rank while the finish forecast warms up — needs 2h of snapshots and 8+ clan pace tracks.`,
    },
    timing: {
      snapshotIntervalMs: updateEveryMs,
      nextUpdateInMs: nextUpdateMs,
      nextUpdateText: formatShortDuration(nextUpdateMs),
      remainingMs,
    },
    history: {
      points24h: displayPointsHistory,
    },
    diagnostics: {
      snapshotsAvailable: snapshotRows.length,
      latestSnapshotRank: rank,
      clanTracks: clanRateMap.size,
      rateCoveragePct: rateCoverage,
      historySpanMinutes: Math.round(snapshotSpanMs / 60_000),
    },
  };
}

// ── fallback payload (no active war) ────────────────────────────────────────

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function buildFallbackPayload() {
  const battleId = await getLatestBattleId();

  if (!battleId) {
    return {
      success: true,
      active: false,
      battleId: null,
      battleName: null,
      current: null,
      summary: "No saved battle snapshots yet.",
    };
  }

  const latestRows = await getLatestSnapshots(battleId);
  const latest = latestRows[0] ?? null;

  if (!latest) {
    return {
      success: true,
      active: false,
      battleId,
      battleName: null,
      current: null,
      summary: "No snapshot rows available yet.",
    };
  }

  const [meta, ourHistory, nearbyRows] = await Promise.all([
    getBattleMeta(battleId),
    getSnapshotHistory(battleId, CLAN_NAME, 24),
    getNearbyClans(battleId, toDate(latest.captured_at) ?? new Date()),
  ]);

  const snapshotTime = toDate(latest.captured_at) ?? new Date();
  const currentRank = asNumber(latest.rank);
  const currentPoints = asNumber(latest.battle_points) ?? 0;

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

  const above = nearbyRows
    .map((r) => ({ rank: asNumber(r.rank), name: String(r.clan_name), points: asNumber(r.points) ?? 0 }))
    .filter((r) => r.rank !== null && currentRank !== null && (r.rank as number) < currentRank)
    .sort((a, b) => (b.rank ?? 999999) - (a.rank ?? 999999))[0] ?? null;
  const below = nearbyRows
    .map((r) => ({ rank: asNumber(r.rank), name: String(r.clan_name), points: asNumber(r.points) ?? 0 }))
    .filter((r) => r.rank !== null && currentRank !== null && (r.rank as number) > currentRank)
    .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))[0] ?? null;

  const gapAbove = above && above.points > currentPoints ? above.points - currentPoints + 1 : null;
  const gapBelow = below && below.points < currentPoints ? currentPoints - below.points : null;
  const confidence = ourHistory.length >= 6 ? "high" : ourHistory.length >= 3 ? "medium" : "low";
  const updateEveryMs = 5 * 60 * 1000;
  const nextUpdateMs = updateEveryMs - (Date.now() % updateEveryMs);

  return {
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
      progressPct: asNumber(latest.progress_percent),
      participants: asNumber(latest.participants),
      totalClans: asNumber(latest.total_clans),
      totalPoints: asNumber(latest.total_points),
    },
    stats: {
      gain24h: pointsHistory.length >= 2 ? Math.max(0, pointsHistory[pointsHistory.length - 1].points - pointsHistory[0].points) : 0,
      hourlyRate,
      averageRate: avgRate,
      gapAbove,
      gapBelow,
      etaAboveMs: hourlyRate && gapAbove ? (gapAbove / Math.max(hourlyRate, 1)) * 3_600_000 : null,
      threatEtaMs: null,
      projectedPlacement: currentRank,
      confidence,
      uiTone: statusTone(currentRank),
    },
    nearby: nearbyRows.slice(0, 10).map((row) => ({
      rank: asNumber(row.rank),
      name: String(row.clan_name),
      points: asNumber(row.points) ?? 0,
    })),
    summary: {
      overview: currentRank !== null ? `${CLAN_NAME} finished #${currentRank} with ${formatNumber(currentPoints)} points.` : `${CLAN_NAME} recorded ${formatNumber(currentPoints)} battle points.`,
      pace: hourlyRate !== null ? `Average pace over the tracked window was ${formatNumber(Math.round(hourlyRate))} points/hour.` : `Pace data is not available.`,
      target: "Battle has ended.",
      threat: "Battle has ended.",
    },
    timing: {
      snapshotIntervalMs: updateEveryMs,
      nextUpdateInMs: nextUpdateMs,
      nextUpdateText: formatShortDuration(nextUpdateMs),
    },
    history: {
      points24h: ourHistory.map((row) => ({
        capturedAt: toDate(row.captured_at)?.toISOString() ?? null,
        points: asNumber(row.battle_points) ?? 0,
        rank: asNumber(row.rank),
      })),
    },
    diagnostics: {
      snapshotsAvailable: ourHistory.length,
      latestSnapshotRank: currentRank,
    },
  };
}

// ── payload cache with single-flight dedup ─────────────────────────────────

let cachedPayload: { data: unknown; at: number } | null = null;
let inFlight: Promise<unknown> | null = null;

async function computePayload(): Promise<unknown> {
  const activeWar = await getActiveWarInfo();
  if (activeWar) return buildLiveBattleHq(activeWar);
  return buildFallbackPayload();
}

async function getPayloadCached(): Promise<unknown> {
  if (cachedPayload && Date.now() - cachedPayload.at < PAYLOAD_CACHE_TTL_MS) {
    return cachedPayload.data;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const data = await computePayload();
      cachedPayload = { data, at: Date.now() };
      return data;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

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

    const payload = await getPayloadCached();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[war-analyst] failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Battle analyst failed",
      },
      { status: 500 }
    );
  }
}
