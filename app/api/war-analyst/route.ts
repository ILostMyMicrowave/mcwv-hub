import { NextResponse } from "next/server";
import { Pool } from "pg";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const DATABASE_URL = process.env.DATABASE_URL;

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
    })
  : null;

type ClanStanding = {
  rank: number | null;
  name: string;
  icon: string | null;
  countryCode: string | null;
  members?: number | null;
  memberCapacity?: number | null;
  points: number;
  reportedPlace: number | null;
  medal: string | null;
  contributorCount?: number | null;
};

type PlayerEntry = {
  rank: number | null;
  userId: number;
  displayName: string;
  points: number;
  share?: number | null;
  clan: {
    name: string;
    icon: string | null;
    countryCode: string | null;
    place: number | null;
  };
};

type HistoricalClanContext = {
  capturedAt: Date;
  clans: ClanStanding[];
  clan: ClanStanding | null;
} | null;

type WarAnalysisResponse = {
  success: boolean;
  active: boolean;
  battleId: string | null;
  warName: string | null;
  current: {
    clanName: string;
    rank: number | null;
    points: number;
    participants: number;
    totalClans: number;
    totalPoints: number;
    timeElapsedMs: number | null;
    timeRemainingMs: number | null;
    progressPct: number | null;
    foundInSample: boolean;
    sampleSource: string | null;
    lastSeenAt: string | null;
  };
  targets: {
    top30: {
      status: "safe" | "reachable" | "unlikely" | "unknown";
      message: string;
    };
    top50: {
      status: "safe" | "reachable" | "unlikely" | "unknown";
      message: string;
    };
  };
  projection: {
    placement: number | null;
    confidence: "low" | "medium" | "high";
    message: string;
  };
  nearbyClans: Array<{
    rank: number | null;
    name: string;
    points: number;
    gapFromUs: number | null;
    relation: "ahead" | "us" | "behind";
  }>;
  topContributor: PlayerEntry | null;
  analysis: {
    overview: string;
    pace: string;
    threat: string;
    summary: string;
  };
  memberActivity: {
    available: false;
    note: string;
    inactiveMembers: never[];
    fallingBehind: never[];
  };
  uiTone: "success" | "warning" | "danger" | "info";
  diagnostics: {
    clanFoundInSample: boolean;
    sampleSource: string | null;
    candidateSources: string[];
    usedFallbackHistory: boolean;
  };
};

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

function pickBattleId(activeJson: any): string | null {
  return (
    activeJson?.data?.activeBattleConfigName ??
    activeJson?.data?.activeBattleId ??
    activeJson?.data?.battleId ??
    activeJson?.activeBattleConfigName ??
    activeJson?.activeBattleId ??
    activeJson?.battleId ??
    null
  );
}

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

function toDate(value: unknown): Date | null {
  const ms = toMs(value);
  if (ms === null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortClans(topClans: any[]): ClanStanding[] {
  return [...topClans]
    .map((clan) => ({
      rank: asNumber(clan?.rank) ?? null,
      name: String(clan?.name ?? clan?.clanName ?? clan?.tag ?? "Unknown Clan"),
      icon: clan?.icon ?? null,
      countryCode: clan?.countryCode ?? clan?.country ?? null,
      members: asNumber(clan?.members) ?? null,
      memberCapacity: asNumber(clan?.memberCapacity) ?? null,
      points: asNumber(clan?.points) ?? 0,
      reportedPlace: asNumber(clan?.reportedPlace) ?? asNumber(clan?.place) ?? null,
      medal: clan?.medal ?? null,
      contributorCount: asNumber(clan?.contributorCount) ?? null,
    }))
    .sort((a, b) => {
      const ap = a.reportedPlace ?? Number.MAX_SAFE_INTEGER;
      const bp = b.reportedPlace ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      return normalizeName(a.name).localeCompare(normalizeName(b.name));
    });
}

function nearbyClansForIndex(clans: ClanStanding[], index: number, ourPoints: number) {
  const start = Math.max(0, index - 2);
  const end = Math.min(clans.length, index + 3);

  return clans.slice(start, end).map((clan, i) => {
    const absoluteIndex = start + i;
    let relation: "ahead" | "us" | "behind" = "us";

    if (absoluteIndex < index) relation = "ahead";
    if (absoluteIndex > index) relation = "behind";

    return {
      rank: clan.reportedPlace ?? clan.rank,
      name: clan.name,
      points: clan.points,
      gapFromUs:
        relation === "us"
          ? 0
          : relation === "ahead"
            ? clan.points - ourPoints
            : ourPoints - clan.points,
      relation,
    };
  });
}

function buildTargetStatus(
  projectedPlacement: number | null,
  target: number,
  currentRank: number | null,
  clanName: string
) {
  if (projectedPlacement === null) {
    return {
      status: "unknown" as const,
      message: `Not enough data yet to judge Top ${target}.`,
    };
  }

  if (projectedPlacement <= target) {
    return {
      status: "safe" as const,
      message: `Current projection keeps ${clanName} inside the Top ${target}.`,
    };
  }

  if (currentRank !== null && currentRank <= target + 5) {
    return {
      status: "reachable" as const,
      message: `Top ${target} is still within range, but the current snapshot places ${clanName} just outside it.`,
    };
  }

  return {
    status: "unlikely" as const,
    message: `${clanName} is currently outside the pace needed for Top ${target}.`,
  };
}

function buildClan(raw: any, fallbackName: string): ClanStanding {
  return {
    rank: asNumber(raw?.rank) ?? null,
    name: String(raw?.name ?? raw?.clanName ?? raw?.tag ?? fallbackName),
    icon: raw?.icon ?? null,
    countryCode: raw?.countryCode ?? raw?.country ?? null,
    members: asNumber(raw?.members) ?? null,
    memberCapacity: asNumber(raw?.memberCapacity) ?? null,
    points: asNumber(raw?.points) ?? 0,
    reportedPlace: asNumber(raw?.reportedPlace) ?? asNumber(raw?.place) ?? null,
    medal: raw?.medal ?? null,
    contributorCount: asNumber(raw?.contributorCount) ?? null,
  };
}

function mergeClanEntries(sources: Array<{ name: string; list: any[] }>) {
  const map = new Map<string, ClanStanding>();

  for (const source of sources) {
    for (const raw of source.list) {
      const clan = buildClan(raw, String(raw?.name ?? raw?.clanName ?? raw?.tag ?? "Unknown Clan"));
      const key = normalizeName(clan.name);
      if (!key) continue;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, clan);
        continue;
      }

      const betterByPoints = clan.points > existing.points;
      const betterByRank =
        clan.points === existing.points &&
        (clan.reportedPlace ?? Number.MAX_SAFE_INTEGER) < (existing.reportedPlace ?? Number.MAX_SAFE_INTEGER);

      if (betterByPoints || betterByRank) {
        map.set(key, {
          ...existing,
          ...clan,
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const ap = a.reportedPlace ?? Number.MAX_SAFE_INTEGER;
    const bp = b.reportedPlace ?? Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    return normalizeName(a.name).localeCompare(normalizeName(b.name));
  });
}

function findClanInSources(sources: Array<{ name: string; list: any[] }>, clanName: string) {
  for (const source of sources) {
    const found =
      source.list.find((c) => namesMatch(c?.name, clanName)) ??
      source.list.find((c) => namesMatch(c?.tag, clanName)) ??
      source.list.find((c) => namesMatch(c?.clanTag, clanName)) ??
      source.list.find((c) => namesMatch(c?.clanName, clanName));

    if (found) return { source: source.name, found };
  }
  return null;
}

function collectClanSources(data: Record<string, unknown>) {
  const sources: Array<{ name: string; list: any[] }> = [];
  const push = (name: string, value: unknown) => {
    const list = asArray(value);
    if (list.length > 0) sources.push({ name, list });
  };

  push("topClans", data.topClans);
  push("clans", data.clans);
  push("clanLeaderboard", data.clanLeaderboard);
  push("leaderboard", data.leaderboard);
  push("battleClans", data.battleClans);
  push("entries", data.entries);
  push("data.topClans", (data as any)?.data?.topClans);
  push("data.clans", (data as any)?.data?.clans);
  push("data.clanLeaderboard", (data as any)?.data?.clanLeaderboard);

  return sources;
}

function pickTopContributor(topPlayersRaw: any[]): PlayerEntry | null {
  const topContributorRaw = topPlayersRaw[0] ?? null;
  if (!topContributorRaw) return null;

  return {
    rank: asNumber(topContributorRaw?.rank) ?? null,
    userId: asNumber(topContributorRaw?.userId) ?? 0,
    displayName: String(topContributorRaw?.displayName ?? topContributorRaw?.userId ?? "Unknown"),
    points: asNumber(topContributorRaw?.points) ?? 0,
    share: asNumber(topContributorRaw?.share) ?? null,
    clan: {
      name: String(topContributorRaw?.clan?.name ?? CLAN_NAME),
      icon: topContributorRaw?.clan?.icon ?? null,
      countryCode: topContributorRaw?.clan?.countryCode ?? null,
      place: asNumber(topContributorRaw?.clan?.place) ?? null,
    },
  };
}

function formatDateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function buildSummaryText(
  clanName: string,
  currentRank: number | null,
  projection: number | null,
  paceText: string,
  threatText: string,
  clanFoundInSample: boolean,
  usedFallbackHistory: boolean
) {
  const positionText =
    currentRank !== null
      ? usedFallbackHistory
        ? `${clanName} is not present in the current public sample, but the latest stored snapshot places it at #${currentRank}.`
        : `${clanName} is currently sitting at #${currentRank}.`
      : clanFoundInSample
        ? `${clanName} is present in the live battle, but a current placement could not be resolved.`
        : `${clanName} is not present in the current public sample, so a live placement could not be resolved.`;

  const projectionText =
    projection !== null
      ? `Based on the current snapshot, ${clanName} is projected to finish around #${projection}.`
      : `A finish prediction is not available yet.`;

  return `${positionText} ${projectionText} ${paceText} ${threatText}`;
}

async function persistBattleData(params: {
  battleId: string;
  battleName: string | null;
  startTime: Date | null;
  endTime: Date | null;
  clanName: string;
  rank: number | null;
  battlePoints: number;
  participants: number;
  totalClans: number;
  totalPoints: number;
  progressPercent: number | null;
  foundInSample: boolean;
  clans: ClanStanding[];
}) {
  if (!pool) return;

  const client = await pool.connect();
  const capturedAt = new Date();

  try {
    const lastSnapshot = await client.query<{ captured_at: Date }>(
      `SELECT captured_at
       FROM war_snapshots
       WHERE battle_id = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [params.battleId]
    );

    const lastCaptured = lastSnapshot.rows[0]?.captured_at ?? null;
    const shouldStoreSnapshot =
      !lastCaptured || capturedAt.getTime() - new Date(lastCaptured).getTime() >= 4 * 60 * 1000;

    if (!shouldStoreSnapshot) return;

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO battles (battle_id, battle_name, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (battle_id)
       DO UPDATE SET
         battle_name = COALESCE(EXCLUDED.battle_name, battles.battle_name),
         start_time = COALESCE(EXCLUDED.start_time, battles.start_time),
         end_time = COALESCE(EXCLUDED.end_time, battles.end_time)`,
      [params.battleId, params.battleName, params.startTime, params.endTime]
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        params.battleId,
        params.clanName,
        capturedAt,
        params.rank,
        params.battlePoints,
        params.participants,
        params.totalClans,
        params.totalPoints,
        params.progressPercent,
        params.foundInSample,
      ]
    );

    if (params.clans.length > 0) {
      const values: unknown[] = [];
      const placeholders = params.clans
        .map((clan, index) => {
          const base = index * 5;
          values.push(params.battleId, clan.name, clan.reportedPlace ?? clan.rank, clan.points, capturedAt);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        })
        .join(", ");

      await client.query(
        `INSERT INTO clan_history (battle_id, clan_name, rank, points, captured_at)
         VALUES ${placeholders}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

async function loadLatestHistoricalClanContext(
  battleId: string,
  clanName: string
): Promise<HistoricalClanContext> {
  if (!pool) return null;

  const latest = await pool.query<{
    captured_at: Date;
    clan_name: string;
    rank: number | null;
    points: number | null;
  }>(
    `SELECT captured_at, clan_name, rank, points
     FROM clan_history
     WHERE battle_id = $1
       AND LOWER(clan_name) = LOWER($2)
     ORDER BY captured_at DESC
     LIMIT 1`,
    [battleId, clanName]
  );

  const row = latest.rows[0];
  if (!row) return null;

  const capturedAt = new Date(row.captured_at);

  const nearby = await pool.query<{
    clan_name: string;
    rank: number | null;
    points: number | null;
  }>(
    `SELECT clan_name, rank, points
     FROM clan_history
     WHERE battle_id = $1
       AND captured_at = $2
     ORDER BY COALESCE(rank, 999999), points DESC, LOWER(clan_name) ASC`,
    [battleId, row.captured_at]
  );

  const clans = nearby.rows
    .map((r) => ({
      rank: asNumber(r.rank) ?? null,
      name: String(r.clan_name),
      icon: null,
      countryCode: null,
      members: null,
      memberCapacity: null,
      points: asNumber(r.points) ?? 0,
      reportedPlace: asNumber(r.rank) ?? null,
      medal: null,
      contributorCount: null,
    }))
    .sort((a, b) => {
      const ap = a.reportedPlace ?? Number.MAX_SAFE_INTEGER;
      const bp = b.reportedPlace ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      return normalizeName(a.name).localeCompare(normalizeName(b.name));
    });

  const clan = clans.find((c) => namesMatch(c.name, clanName)) ?? null;

  return {
    capturedAt,
    clans,
    clan,
  };
}

async function loadBattleContextFromHistory(battleId: string, clanName: string) {
  try {
    return await loadLatestHistoricalClanContext(battleId, clanName);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const activeRes = await fetch(`${BASE}/v1/clans/players`, {
      cache: "no-store",
    });

    if (!activeRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "PS99 players endpoint failed",
        },
        { status: 502 }
      );
    }

    const activeJson = await activeRes.json().catch(() => null);
    const battleId = pickBattleId(activeJson);

    if (!battleId) {
      const empty: WarAnalysisResponse = {
        success: true,
        active: false,
        battleId: null,
        warName: null,
        current: {
          clanName: CLAN_NAME,
          rank: null,
          points: 0,
          participants: 0,
          totalClans: 0,
          totalPoints: 0,
          timeElapsedMs: null,
          timeRemainingMs: null,
          progressPct: null,
          foundInSample: false,
          sampleSource: null,
          lastSeenAt: null,
        },
        targets: {
          top30: {
            status: "unknown",
            message: "No live battle is active right now.",
          },
          top50: {
            status: "unknown",
            message: "No live battle is active right now.",
          },
        },
        projection: {
          placement: null,
          confidence: "low",
          message: "No active battle is currently available.",
        },
        nearbyClans: [],
        topContributor: null,
        analysis: {
          overview: "There is no active war to analyse at the moment.",
          pace: "Pace analysis is unavailable until a live battle starts.",
          threat: "No threat check can be made without a live battle.",
          summary: "The War Analyst will become active once a battle is live.",
        },
        memberActivity: {
          available: false,
          note:
            "Member-level activity detection needs your own internal contribution snapshots, so it is not available from the public PS99 battle API alone.",
          inactiveMembers: [],
          fallingBehind: [],
        },
        uiTone: "info",
        diagnostics: {
          clanFoundInSample: false,
          sampleSource: null,
          candidateSources: [],
          usedFallbackHistory: false,
        },
      };

      return NextResponse.json(empty, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    const battleRes = await fetch(`${BASE}/v1/clans/battles/${encodeURIComponent(battleId)}`, {
      cache: "no-store",
    });

    if (!battleRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "PS99 battle endpoint failed",
        },
        { status: 502 }
      );
    }

    const battleJson = await battleRes.json().catch(() => null);
    const data = (battleJson?.data ?? {}) as Record<string, unknown>;
    const meta = (data?.meta ?? {}) as Record<string, unknown>;
    const stats = (data?.stats ?? {}) as Record<string, unknown>;
    const topPlayersRaw = asArray(data?.topPlayers);

    const clanSources = collectClanSources(data);
    const mergedClans = mergeClanEntries(clanSources);
    const clanLookup = findClanInSources(clanSources, CLAN_NAME);

    let ourClanRaw: any = clanLookup?.found ?? null;
    let sampleSource: string | null = clanLookup?.source ?? null;
    let usedFallbackHistory = false;

    if (!ourClanRaw) {
      const playerClanMatch = topPlayersRaw.find((p) => namesMatch(p?.clan?.name, CLAN_NAME));
      if (playerClanMatch?.clan) {
        ourClanRaw = {
          name: playerClanMatch.clan.name,
          icon: playerClanMatch.clan.icon ?? null,
          countryCode: playerClanMatch.clan.countryCode ?? null,
          points: asNumber(playerClanMatch.clan.points) ?? 0,
          reportedPlace: asNumber(playerClanMatch.clan.place) ?? null,
        };
        sampleSource = "topPlayers.clan";
      }
    }

    let historicalContext: HistoricalClanContext = null;
    if (!ourClanRaw) {
      historicalContext = await loadBattleContextFromHistory(battleId, CLAN_NAME);
      if (historicalContext?.clan) {
        ourClanRaw = {
          name: historicalContext.clan.name,
          icon: historicalContext.clan.icon,
          countryCode: historicalContext.clan.countryCode,
          points: historicalContext.clan.points,
          reportedPlace: historicalContext.clan.reportedPlace,
        };
        sampleSource = "database";
        usedFallbackHistory = true;
      }
    }

    const ourClan = ourClanRaw ? buildClan(ourClanRaw, CLAN_NAME) : null;
    const currentRank =
      ourClan?.reportedPlace ??
      ourClan?.rank ??
      asNumber(ourClanRaw?.place) ??
      asNumber(ourClanRaw?.position) ??
      null;

    const currentClanName = ourClan?.name ?? CLAN_NAME;
    const currentPoints = ourClan?.points ?? 0;

    const liveIndex =
      ourClan && mergedClans.length
        ? mergedClans.findIndex((c) => normalizeName(c.name) === normalizeName(ourClan.name))
        : -1;

    const historyIndex =
      usedFallbackHistory && historicalContext?.clans.length && historicalContext.clan
        ? historicalContext.clans.findIndex((c) => normalizeName(c.name) === normalizeName(historicalContext.clan?.name))
        : -1;

    const nearbyClans =
      liveIndex >= 0
        ? nearbyClansForIndex(mergedClans, liveIndex, currentPoints)
        : historyIndex >= 0 && historicalContext
          ? nearbyClansForIndex(historicalContext.clans, historyIndex, currentPoints)
          : [];

    const totalClans = asNumber(stats?.participatingClans) ?? mergedClans.length ?? 0;
    const totalPoints = asNumber(stats?.totalClanPoints) ?? 0;
    const participants = asNumber(stats?.totalContributors) ?? 0;

    const startDate = toDate(meta?.startTime);
    const endDate = toDate(meta?.finishTime);
    const now = Date.now();

    const validTime = startDate !== null && endDate !== null && endDate.getTime() > startDate.getTime();
    const timeElapsedMs = validTime ? Math.max(0, now - startDate!.getTime()) : null;
    const timeRemainingMs = validTime ? Math.max(0, endDate!.getTime() - now) : null;
    const progressPct = validTime
      ? clamp(((now - startDate!.getTime()) / (endDate!.getTime() - startDate!.getTime())) * 100, 0, 100)
      : null;

    let projectedPlacement: number | null = currentRank;

    if (
      currentRank !== null &&
      ((liveIndex >= 0 && mergedClans.length) || (historyIndex >= 0 && historicalContext?.clans.length))
    ) {
      const sourceClans = liveIndex >= 0 ? mergedClans : historicalContext?.clans ?? [];
      const idx = liveIndex >= 0 ? liveIndex : historyIndex;
      if (idx >= 0) {
        const prevClan = sourceClans[idx - 1] ?? null;
        const nextClan = sourceClans[idx + 1] ?? null;

        const gapAhead = prevClan ? prevClan.points - currentPoints : null;
        const gapBehind = nextClan ? currentPoints - nextClan.points : null;
        let adjustment = 0;
        const pointScale = Math.max(10_000, currentPoints * 0.03);

        if (gapBehind !== null && gapBehind <= pointScale) adjustment += 1;
        if (gapBehind !== null && gapBehind <= pointScale * 0.5) adjustment += 1;
        if (gapAhead !== null && gapAhead <= pointScale) adjustment -= 1;
        if (gapAhead !== null && gapAhead <= pointScale * 0.5) adjustment -= 1;

        const volatility = progressPct === null ? 0.5 : clamp(1 - progressPct / 100, 0.15, 1);
        adjustment = adjustment * volatility;

        projectedPlacement = clamp(Math.round(currentRank + adjustment), 1, Math.max(totalClans, currentRank));
      }
    }

    const target30 = buildTargetStatus(projectedPlacement, 30, currentRank, currentClanName);
    const target50 = buildTargetStatus(projectedPlacement, 50, currentRank, currentClanName);

    let confidence: "low" | "medium" | "high" = "low";
    if (projectedPlacement !== null && currentRank !== null) {
      if (Math.abs(projectedPlacement - currentRank) <= 1) confidence = "high";
      else if (Math.abs(projectedPlacement - currentRank) <= 3) confidence = "medium";
      else confidence = "low";
    }

    let uiTone: "success" | "warning" | "danger" | "info" = "info";
    if (projectedPlacement !== null) {
      if (projectedPlacement <= 30) uiTone = "success";
      else if (projectedPlacement <= 50) uiTone = "warning";
      else uiTone = "danger";
    }

    const topContributor = pickTopContributor(topPlayersRaw);
    const clanFoundInSample = Boolean(
      clanLookup?.found || topPlayersRaw.some((p) => namesMatch(p?.clan?.name, CLAN_NAME))
    );
    const lastSeenAt = usedFallbackHistory ? formatDateTime(historicalContext?.capturedAt ?? null) : formatDateTime(new Date());

    const paceText =
      target50.status === "safe"
        ? `${currentClanName} is on pace for a Top 50 finish.`
        : target30.status === "safe"
          ? `${currentClanName} is inside Top 30 range on the current snapshot.`
          : `${currentClanName} is currently outside the pace needed for a comfortable Top 50 finish.`;

    const threatClan = nearbyClans.find((c) => c.relation === "behind" && c.gapFromUs !== null) ?? null;

    const threatText =
      threatClan && threatClan.gapFromUs !== null
        ? `${threatClan.name} is the closest clan behind ${currentClanName}, trailing by ${threatClan.gapFromUs.toLocaleString(
            "en-GB"
          )} points.`
        : `No immediate trailing clan threat could be resolved from the current snapshot.`;

    const summaryText = buildSummaryText(
      currentClanName,
      currentRank,
      projectedPlacement,
      paceText,
      threatText,
      clanFoundInSample,
      usedFallbackHistory
    );

    const response: WarAnalysisResponse = {
      success: true,
      active: true,
      battleId,
      warName: String(meta?.title ?? meta?.name ?? meta?.id ?? battleId),
      current: {
        clanName: currentClanName,
        rank: currentRank,
        points: currentPoints,
        participants,
        totalClans,
        totalPoints,
        timeElapsedMs,
        timeRemainingMs,
        progressPct,
        foundInSample: clanFoundInSample,
        sampleSource,
        lastSeenAt,
      },
      targets: {
        top30: target30,
        top50: target50,
      },
      projection: {
        placement: projectedPlacement,
        confidence,
        message:
          projectedPlacement !== null
            ? `Based on the current snapshot, ${currentClanName} is projected to finish around #${projectedPlacement}.`
            : `A finish prediction is not available yet.`,
      },
      nearbyClans,
      topContributor,
      analysis: {
        overview: summaryText.split(". ")[0] + ".",
        pace: paceText,
        threat: threatText,
        summary: summaryText,
      },
      memberActivity: {
        available: false,
        note:
          "Member-level activity detection needs your own contribution snapshots. The public PS99 battle API can show clan and player standings, but it does not expose the full internal activity history needed for accurate inactivity tracking.",
        inactiveMembers: [],
        fallingBehind: [],
      },
      uiTone,
      diagnostics: {
        clanFoundInSample,
        sampleSource,
        candidateSources: clanSources.map((s) => s.name),
        usedFallbackHistory,
      },
    };

    await persistBattleData({
      battleId,
      battleName: String(meta?.title ?? meta?.name ?? meta?.id ?? battleId),
      startTime: startDate,
      endTime: endDate,
      clanName: currentClanName,
      rank: currentRank,
      battlePoints: currentPoints,
      participants,
      totalClans,
      totalPoints,
      progressPercent: progressPct,
      foundInSample: clanFoundInSample,
      clans: mergedClans,
    });

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "WAR ANALYST CRASHED",
      },
      { status: 500 }
    );
  }
      }
