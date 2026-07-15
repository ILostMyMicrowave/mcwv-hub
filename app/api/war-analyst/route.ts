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
  return String(value ?? "").trim().toLowerCase();
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

function findOurClan(topClans: any[]) {
  const target = normalizeName(CLAN_NAME);

  return (
    topClans.find((c) => normalizeName(c?.name) === target) ??
    topClans.find((c) => normalizeName(c?.tag) === target) ??
    topClans.find((c) => normalizeName(c?.clanTag) === target) ??
    topClans.find((c) => normalizeName(c?.clanName) === target) ??
    null
  );
}

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const n = asNumber(value);
  if (n === null) return null;

  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortClans(topClans: any[]): ClanStanding[] {
  return [...topClans]
    .map((clan) => ({
      rank: asNumber(clan?.rank) ?? null,
      name: String(clan?.name ?? "Unknown Clan"),
      icon: clan?.icon ?? null,
      countryCode: clan?.countryCode ?? clan?.country ?? null,
      members: asNumber(clan?.members) ?? null,
      memberCapacity: asNumber(clan?.memberCapacity) ?? null,
      points: asNumber(clan?.points) ?? 0,
      reportedPlace: asNumber(clan?.reportedPlace) ?? null,
      medal: clan?.medal ?? null,
      contributorCount: asNumber(clan?.contributorCount) ?? null,
    }))
    .sort((a, b) => {
      const ap = a.reportedPlace ?? Number.MAX_SAFE_INTEGER;
      const bp = b.reportedPlace ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;
      return (b.points ?? 0) - (a.points ?? 0);
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
  currentRank: number | null
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
      message: `Current projection keeps MCWV inside the Top ${target}.`,
    };
  }

  if (currentRank !== null && currentRank <= target + 5) {
    return {
      status: "reachable" as const,
      message: `Top ${target} is still within range, but the current snapshot places MCWV just outside it.`,
    };
  }

  return {
    status: "unlikely" as const,
    message: `MCWV is currently outside the pace needed for Top ${target}.`,
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

      return NextResponse.json(empty, {
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
    const data = battleJson?.data ?? {};
    const meta = data?.meta ?? {};
    const stats = data?.stats ?? {};

    const topClansRaw = asArray(data?.topClans);
    const topPlayersRaw = asArray(data?.topPlayers);

    const clans = sortClans(topClansRaw);

    const ourClanRaw =
      findOurClan(topClansRaw) ??
      data?.yourClan ??
      data?.clan ??
      data?.myClan ??
      null;

    const ourClan = ourClanRaw
      ? {
          rank: asNumber(ourClanRaw?.rank) ?? null,
          name: String(ourClanRaw?.name ?? CLAN_NAME),
          icon: ourClanRaw?.icon ?? null,
          countryCode: ourClanRaw?.countryCode ?? ourClanRaw?.country ?? null,
          members: asNumber(ourClanRaw?.members) ?? null,
          memberCapacity: asNumber(ourClanRaw?.memberCapacity) ?? null,
          points: asNumber(ourClanRaw?.points) ?? 0,
          reportedPlace: asNumber(ourClanRaw?.reportedPlace) ?? null,
          medal: ourClanRaw?.medal ?? null,
          contributorCount: asNumber(ourClanRaw?.contributorCount) ?? null,
        }
      : null;

    const currentRank =
      ourClan?.reportedPlace ??
      ourClan?.rank ??
      asNumber(ourClanRaw?.place) ??
      asNumber(ourClanRaw?.position) ??
      null;

    const ourPoints = ourClan?.points ?? 0;

    const ourIndex =
      ourClan && clans.length
        ? clans.findIndex(
            (c) => normalizeName(c.name) === normalizeName(ourClan.name)
          )
        : -1;

    const nearbyClans =
      ourIndex >= 0 ? nearbyClansForIndex(clans, ourIndex, ourPoints) : [];

    const totalClans = asNumber(stats?.participatingClans) ?? clans.length ?? 0;
    const totalPoints = asNumber(stats?.totalClanPoints) ?? 0;
    const participants = asNumber(stats?.totalContributors) ?? 0;

    const startMs = toMs(meta?.startTime);
    const endMs = toMs(meta?.finishTime);
    const now = Date.now();

    const validTime =
      startMs !== null && endMs !== null && endMs > startMs;

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

      const volatility =
        progressPct === null ? 0.5 : clamp(1 - progressPct / 100, 0.15, 1);

      adjustment = adjustment * volatility;

      projectedPlacement = clamp(
        Math.round(currentRank + adjustment),
        1,
        Math.max(totalClans, currentRank)
      );
    }

    const target30 = buildTargetStatus(projectedPlacement, 30, currentRank);
    const target50 = buildTargetStatus(projectedPlacement, 50, currentRank);

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

    const topContributorRaw = topPlayersRaw[0] ?? null;
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

    const positionText =
      currentRank !== null
        ? `MCWV is currently sitting at #${currentRank}.`
        : `MCWV is present in the live battle, but a current placement could not be resolved.`;

    const projectionText =
      projectedPlacement !== null
        ? `Based on the current snapshot, MCWV is projected to finish around #${projectedPlacement}.`
        : `A finish prediction is not available yet.`;

    const paceText =
      target50.status === "safe"
        ? `MCWV is on pace for a Top 50 finish.`
        : target30.status === "safe"
          ? `MCWV is inside Top 30 range on the current snapshot.`
          : `MCWV is currently outside the pace needed for a comfortable Top 50 finish.`;

    const threatClan =
      nearbyClans.find((c) => c.relation === "behind" && c.gapFromUs !== null) ?? null;

    const threatText =
      threatClan && threatClan.gapFromUs !== null
        ? `${threatClan.name} is the closest clan behind MCWV, trailing by ${threatClan.gapFromUs.toLocaleString(
            "en-GB"
          )} points.`
        : `No immediate trailing clan threat could be resolved from the current snapshot.`;

    const summaryText = `${positionText} ${projectionText} ${paceText} ${threatText}`;

    const response: WarAnalysisResponse = {
      success: true,
      active: true,
      battleId,
      warName: meta?.title ?? meta?.name ?? meta?.id ?? battleId,
      current: {
        clanName: ourClan?.name ?? CLAN_NAME,
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
          "Member-level inactivity detection needs your own contribution snapshots. The public PS99 clan battle API can show clan and player standings, but it does not expose the full internal activity history needed for accurate inactivity tracking.",
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
