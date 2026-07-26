import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const CLAN_API = process.env.CLAN_API ?? "";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const BIG_GAMES_INDEX_CLAN_URL = `https://db.biggames.io/clans/leaderboard?sort=Points&item=${encodeURIComponent(CLAN_NAME)}&tab=overview`;

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
    const progressPct = start > 0 && finish > start ? clamp(((Date.now() / 1000 - start) / (finish - start)) * 100, 0, 100) : null;

    return { battleId, title, start, finish, progressPct };
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

async function buildLiveBattleHq(active: LiveWarInfo) {
  const [liveBattle, publicBattle, indexOverview] = await Promise.all([
    getLiveClanBattle(active),
    getPublicBattle(active),
    getBigGamesIndexClanOverview(),
  ]);

  const contributions = Array.isArray(liveBattle?.PointContributions)
    ? liveBattle.PointContributions.filter((entry): entry is LiveContribution => !!entry && typeof entry === "object")
    : [];
  const currentPoints = indexOverview?.points ?? asNumber(liveBattle?.Points) ?? contributions.reduce((sum, entry) => sum + contributionPoints(entry), 0);
  const participants = contributions.filter((entry) => contributionPoints(entry) > 0).length || null;

  const topClans = Array.isArray(publicBattle?.topClans) ? publicBattle.topClans : [];
  const publicMcwv = topClans.find((clan: Record<string, unknown>) => namesMatch(clan?.name, CLAN_NAME)) ?? null;
  const totalClans = asNumber(publicBattle?.stats?.participatingClans) ?? (topClans.length || null);
  const totalPoints = asNumber(publicBattle?.stats?.totalClanPoints);

  const publicNearby: Array<{ rank: number | null; name: string; points: number }> = topClans
    .map((clan: Record<string, unknown>) => ({
      rank: asNumber(clan.rank ?? clan.reportedPlace ?? clan.place),
      name: String(clan.name ?? "Unknown"),
      points: asNumber(clan.points) ?? 0,
    }))
    .filter((clan: { name: string }) => clan.name !== "Unknown");

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
  const rank = indexOverview?.rank ?? liveRank ?? publicRank;

  const nearbyWithUs = [
    ...publicNearby.filter((clan) => !namesMatch(clan.name, CLAN_NAME)),
    {
      rank,
      name: CLAN_NAME,
      points: currentPoints,
    },
  ].sort((a, b) => b.points - a.points);

  const ourIndex = nearbyWithUs.findIndex((clan) => namesMatch(clan.name, CLAN_NAME));
  const ourNearby = ourIndex >= 0
    ? nearbyWithUs.slice(Math.max(0, ourIndex - 5), ourIndex + 6)
    : nearbyWithUs.slice(0, 10);

  const above = ourIndex > 0 ? nearbyWithUs[ourIndex - 1] : null;
  const below = ourIndex >= 0 && ourIndex < nearbyWithUs.length - 1 ? nearbyWithUs[ourIndex + 1] : null;
  const gapAbove = above && above.points > currentPoints ? above.points - currentPoints + 1 : null;
  const gapBelow = below && below.points < currentPoints ? currentPoints - below.points : null;
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
      gain24h: 0,
      hourlyRate: null,
      averageRate: null,
      gapAbove,
      gapBelow,
      etaAboveMs: null,
      threatEtaMs: null,
      projectedPlacement: rank,
      confidence: "low" as const,
      uiTone: statusTone(rank),
    },
    nearby: ourNearby.length ? ourNearby : [{ rank, name: CLAN_NAME, points: currentPoints }],
    summary: {
      overview: rank !== null ? `${CLAN_NAME} is currently #${rank} with ${formatNumber(currentPoints)} points.` : `${CLAN_NAME} has ${formatNumber(currentPoints)} battle points. Rank is not available yet.`,
      pace: `Live battle data is updating from the clan API. Pace needs more snapshots before it can be calculated.`,
      target: gapAbove !== null && above ? `${above.name} is the next clan to pass.` : `No next target could be resolved yet.`,
      threat: gapBelow !== null && below ? `${below.name} is the closest danger from below.` : `No close threat from below could be resolved yet.`,
    },
    timing: {
      snapshotIntervalMs: updateEveryMs,
      nextUpdateInMs: nextUpdateMs,
      nextUpdateText: formatShortDuration(nextUpdateMs),
    },
    history: {
      points24h: [],
    },
    diagnostics: {
      snapshotsAvailable: 0,
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
