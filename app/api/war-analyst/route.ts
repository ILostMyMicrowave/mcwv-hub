import { NextResponse } from "next/server";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";

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

function sameClan(a: unknown, b: unknown): boolean {
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

  const n = asNumber(value);
  if (n === null) return null;

  return n < 10_000_000_000 ? n * 1000 : n;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortClans(topClans: any[]): ClanStanding[] {
  return [...topClans]
    .map((clan) => ({
      rank: asNumber(clan?.rank) ?? null,
      name: String(clan?.name ?? clan?.clanName ?? "Unknown Clan"),
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

function findOurClan(topClans: any[]) {
  return (
    topClans.find((c) => sameClan(c?.name, CLAN_NAME)) ??
    topClans.find((c) => sameClan(c?.tag, CLAN_NAME)) ??
    topClans.find((c) => sameClan(c?.clanTag, CLAN_NAME)) ??
    topClans.find((c) => sameClan(c?.clanName, CLAN_NAME)) ??
    null
  );
}

function findClanAcrossSources(data: Record<string, any>) {
  const sources: Array<{ name: string; list: any[] }> = [
    { name: "topClans", list: asArray(data.topClans) },
    { name: "clans", list: asArray(data.clans) },
    { name: "clanLeaderboard", list: asArray(data.clanLeaderboard) },
    { name: "leaderboard", list: asArray(data.leaderboard) },
    { name: "battleClans", list: asArray(data.battleClans) },
    { name: "entries", list: asArray(data.entries) },
  ];

  for (const source of sources) {
    const found = findOurClan(source.list);
    if (found) {
      return { found, source: source.name, sources: sources.map((s) => s.name) };
    }
  }

  const topPlayers = asArray(data.topPlayers);
  const playerClan = topPlayers.find((p) => sameClan(p?.clan?.name, CLAN_NAME));

  if (playerClan?.clan) {
    return {
      found: {
        name: playerClan.clan.name ?? CLAN_NAME,
        icon: playerClan.clan.icon ?? null,
        countryCode: playerClan.clan.countryCode ?? null,
        points: asNumber(playerClan.clan.points) ?? 0,
        reportedPlace: asNumber(playerClan.clan.place) ?? null,
        rank: asNumber(playerClan.clan.place) ?? null,
        members: null,
        memberCapacity: null,
        medal: null,
        contributorCount: null,
      },
      source: "topPlayers.clan",
      sources: sources.map((s) => s.name).concat("topPlayers.clan"),
    };
  }

  return { found: null, source: null, sources: sources.map((s) => s.name) };
}

function buildEmptyResponse(): WarAnalysisResponse {
  return {
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
      summary: "The War Assistant will become active once a battle is live.",
    },
    memberActivity: {
      available: false,
      note:
        "Member-level activity detection needs your own internal contribution snapshots, so it is not available from the public PS99 battle API alone.",
      inactiveMembers: [],
      fallingBehind: [],
    },
    uiTone: "info",
  };
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
      return NextResponse.json(buildEmptyResponse(), {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    const battleRes = await fetch(
      `${BASE}/v1/clans/battles/${encodeURIComponent(battleId)}`,
      {
        cache: "no-store",
      }
    );

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
    const data = (battleJson?.data ?? {}) as Record<string, any>;
    const meta = (data?.meta ?? {}) as Record<string, any>;
    const stats = (data?.stats ?? {}) as Record<string, any>;

    const clanSearch = findClanAcrossSources(data);
    const ourClanRaw = clanSearch.found;
    const sampleSource = clanSearch.source;
    const sourceList = clanSearch.sources;

    const clans = sortClans(asArray(data?.topClans));

    const currentRank =
      ourClanRaw?.reportedPlace ??
      ourClanRaw?.rank ??
      asNumber(ourClanRaw?.place) ??
      asNumber(ourClanRaw?.position) ??
      null;

    const ourPoints = asNumber(ourClanRaw?.points) ?? 0;

    const ourIndex =
      ourClanRaw && clans.length
        ? clans.findIndex((c) => normalizeName(c.name) === normalizeName(ourClanRaw.name))
        : -1;

    const nearbyClans = ourIndex >= 0 ? nearbyClansForIndex(clans, ourIndex, ourPoints) : [];

    const totalClans = asNumber(stats?.participatingClans) ?? clans.length ?? 0;
    const totalPoints = asNumber(stats?.totalClanPoints) ?? 0;
    const participants = asNumber(stats?.totalContributors) ?? 0;

    const startMs = toMs(meta?.startTime);
    const endMs = toMs(meta?.finishTime);
    const now = Date.now();

    const validTime = startMs !== null && endMs !== null && endMs > startMs;
    const timeElapsedMs = validTime ? Math.max(0, now - startMs!) : null;
    const timeRemainingMs = validTime ? Math.max(0, endMs! - now) : null;
    const progressPct = validTime
      ? clamp(((now - startMs!) / (endMs! - startMs!)) * 100, 0, 100)
      : null;

    let projectedPlacement: number | null = currentRank;

    if (currentRank !== null && ourIndex >= 0 && clans.length) {
      const prevClan = clans[ourIndex - 1] ?? null;
      const nextClan = clans[ourIndex + 1] ?? null;

      const gapAhead = prevClan ? prevClan.points - ourPoints : null;
      const gapBehind = nextClan ? ourPoints - nextClan.points : null;

      let adjustment = 0;
      const pointScale = Math.max(10_000, ourPoints * 0.03);

      if (gapBehind !== null && gapBehind <= pointScale) adjustment += 1;
      if (gapBehind !== null && gapBehind <= pointScale * 0.5) adjustment += 1;
      if (gapAhead !== null && gapAhead <= pointScale) adjustment -= 1;
      if (gapAhead !== null && gapAhead <= pointScale * 0.5) adjustment -= 1;

      const volatility = progressPct === null ? 0.5 : clamp(1 - progressPct / 100, 0.15, 1);
      adjustment = adjustment * volatility;

      projectedPlacement = clamp(
        Math.round(currentRank + adjustment),
        1,
        Math.max(totalClans, currentRank)
      );
    }

    const clanLabel = String(ourClanRaw?.name ?? CLAN_NAME);

    const target30 = buildTargetStatus(projectedPlacement, 30, currentRank, clanLabel);
    const target50 = buildTargetStatus(projectedPlacement, 50, currentRank, clanLabel);

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

    const topContributorRaw = asArray(data?.topPlayers)[0] ?? null;
    const topContributor: PlayerEntry | null = topContributorRaw
      ? {
          rank: asNumber(topContributorRaw?.rank) ?? null,
          userId: asNumber(topContributorRaw?.userId) ?? 0,
          displayName: String(
            topContributorRaw?.displayName ?? topContributorRaw?.userId ?? "Unknown"
          ),
          points: asNumber(topContributorRaw?.points) ?? 0,
          share: asNumber(topContributorRaw?.share) ?? null,
          clan: {
            name: String(topContributorRaw?.clan?.name ?? CLAN_NAME),
            icon: topContributorRaw?.clan?.icon ?? null,
            countryCode: topContributorRaw?.clan?.countryCode ?? null,
            place: asNumber(topContributorRaw?.clan?.place) ?? null,
          },
        }
      : null;

    const clanFoundInSample = Boolean(ourClanRaw);

    const positionText =
      currentRank !== null
        ? `${clanLabel} is currently sitting at #${currentRank}.`
        : clanFoundInSample
          ? `${clanLabel} is present in the live battle, but a current placement could not be resolved.`
          : `${clanLabel} is not present in the current public sample, so a live placement could not be resolved.`;

    const projectionText =
      projectedPlacement !== null
        ? `Based on the current snapshot, ${clanLabel} is projected to finish around #${projectedPlacement}.`
        : `A finish prediction is not available yet.`;

    const paceText =
      target50.status === "safe"
        ? `${clanLabel} is on pace for a Top 50 finish.`
        : target30.status === "safe"
          ? `${clanLabel} is inside Top 30 range on the current snapshot.`
          : `${clanLabel} is currently outside the pace needed for a comfortable Top 50 finish.`;

    const threatClan =
      nearbyClans.find((c) => c.relation === "behind" && c.gapFromUs !== null) ?? null;

    const threatText =
      threatClan && threatClan.gapFromUs !== null
        ? `${threatClan.name} is the closest clan behind ${clanLabel}, trailing by ${threatClan.gapFromUs.toLocaleString(
            "en-GB"
          )} points.`
        : `No immediate trailing clan threat could be resolved from the current snapshot.`;

    const summaryText = `${positionText} ${projectionText} ${paceText} ${threatText}`;

    const response: WarAnalysisResponse = {
      success: true,
      active: true,
      battleId,
      warName: String(meta?.title ?? meta?.name ?? meta?.id ?? battleId),
      current: {
        clanName: clanLabel,
        rank: currentRank,
        points: ourPoints,
        participants,
        totalClans,
        totalPoints,
        timeElapsedMs,
        timeRemainingMs,
        progressPct,
      },
      targets: {
        top30: target30,
        top50: target50,
      },
      projection: {
        placement: projectedPlacement,
        confidence,
        message: projectionText,
      },
      nearbyClans,
      topContributor,
      analysis: {
        overview: positionText,
        pace: paceText,
        threat: threatText,
        summary: summaryText,
      },
      memberActivity: {
        available: false,
        note:
          "Member-level inactivity detection needs your own contribution snapshots. The public PS99 battle API can show clan and player standings, but it does not expose the full internal activity history needed for accurate inactivity tracking.",
        inactiveMembers: [],
        fallingBehind: [],
      },
      uiTone,
    };

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
