/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { getDetectedWarWindow } from "@/lib/warDetection";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = "MCWV";
const CLAN_API = process.env.CLAN_API ?? "";
const BIG_GAMES_INDEX_CLAN_URL = `https://db.biggames.io/clans/leaderboard?sort=Points&item=${encodeURIComponent(CLAN_NAME)}&tab=overview`;
const LEGACY_CLANS_LEADERBOARD_URL = `${BASE}/api/clans?page=1&pageSize=50&sort=Points&sortOrder=desc`;

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n < 10_000_000_000 ? n * 1000 : n;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function toIsoTime(value: unknown): string | null {
  const ms = toMs(value);
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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
  const target = CLAN_NAME.trim().toLowerCase();

  return (
    topClans.find((c) => String(c?.name ?? "").trim().toLowerCase() === target) ??
    topClans.find((c) => String(c?.tag ?? "").trim().toLowerCase() === target) ??
    topClans.find((c) => String(c?.clanTag ?? "").trim().toLowerCase() === target) ??
    topClans.find((c) => String(c?.clanName ?? "").trim().toLowerCase() === target) ??
    null
  );
}


function getClanPoints(clan: any): number | null {
  return (
    asNumber(clan?.Points) ??
    asNumber(clan?.points) ??
    asNumber(clan?.BattlePoints) ??
    asNumber(clan?.battlePoints) ??
    asNumber(clan?.Score) ??
    asNumber(clan?.score) ??
    asNumber(clan?.Value) ??
    asNumber(clan?.value) ??
    null
  );
}

function clanIconUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const assetId = raw.match(/\d+/)?.[0];
  return assetId ? `${BASE}/image/${assetId}` : null;
}

function getClanMemberCount(clan: any): number | null {
  if (Array.isArray(clan?.Members)) return clan.Members.length;
  return (
    asNumber(clan?.Members) ??
    asNumber(clan?.members) ??
    asNumber(clan?.MemberCount) ??
    asNumber(clan?.memberCount) ??
    asNumber(clan?.membersCount) ??
    null
  );
}

function contributionPoints(entry: any): number {
  return asNumber(entry?.Points ?? entry?.points ?? entry?.BattlePoints ?? entry?.battlePoints) ?? 0;
}

function extractClanList(response: any): any[] {
  return asArray(
    response?.data?.clans ??
      response?.data?.items ??
      response?.data ??
      response?.items ??
      response?.clans
  );
}

async function getTop50ClanLeaderboard() {
  try {
    const res = await fetch(LEGACY_CLANS_LEADERBOARD_URL, {
      cache: "no-store",
      headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
    });

    if (!res.ok) return [];

    const json = await res.json().catch(() => null);
    const clans = extractClanList(json).slice(0, 50);

    return clans.map((clan, index) => ({
      rank: asNumber(clan?.rank ?? clan?.Rank ?? clan?.place ?? clan?.Place) ?? index + 1,
      name: String(clan?.Name ?? clan?.name ?? clan?.ClanName ?? clan?.clanName ?? "Unknown"),
      tag: String(clan?.Tag ?? clan?.tag ?? clan?.Name ?? clan?.name ?? "").trim() || null,
      icon: clanIconUrl(clan?.Icon ?? clan?.icon),
      countryCode: clan?.CountryCode ?? clan?.countryCode ?? clan?.country ?? null,
      members: getClanMemberCount(clan),
      memberCapacity: asNumber(clan?.MemberCapacity ?? clan?.memberCapacity) ?? null,
      points: getClanPoints(clan) ?? 0,
    }));
  } catch {
    return [];
  }
}

function pickClanBattle(clanJson: any, battleId: string, warName?: string | null) {
  const battles = clanJson?.data?.Battles ?? clanJson?.Battles ?? {};
  const entries = Object.entries(battles) as Array<[string, any]>;
  if (!entries.length) return null;

  const targetIds = new Set(
    [battleId, warName]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ""))
  );

  const exact = entries.find(([key, battle]) => {
    const candidates = [key, battle?.BattleID, battle?.battleId, battle?.configName, battle?.Title, battle?.title]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ""));
    return candidates.some((candidate) => targetIds.has(candidate));
  });

  return exact?.[1] ?? null;
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
  } catch {
    return null;
  }
}

async function getMcwvBattleStats(battleId: string, warName?: string | null) {
  if (!CLAN_API) return null;

  try {
    const res = await fetch(CLAN_API, { cache: "no-store" });
    if (!res.ok) return null;

    const clanJson = await res.json().catch(() => null);
    const battle = pickClanBattle(clanJson, battleId, warName);
    if (!battle) return null;

    const contributions = asArray(battle?.PointContributions ?? battle?.pointContributions);
    const membersWithPoints = contributions.filter((entry) => contributionPoints(entry) > 0).length;
    const summedPoints = contributions.reduce((total, entry) => total + contributionPoints(entry), 0);
    const battlePoints = asNumber(battle?.Points ?? battle?.points ?? battle?.BattlePoints ?? battle?.battlePoints);

    return {
      points: battlePoints ?? summedPoints,
      participants: membersWithPoints,
    };
  } catch {
    return null;
  }
}

function deriveState(meta: any, startTime: string | null, endTime: string | null) {
  if (meta?.state) return String(meta.state);
  const start = startTime ? Date.parse(startTime) : null;
  const end = endTime ? Date.parse(endTime) : null;
  const now = Date.now();
  if (start !== null && end !== null) {
    if (now < start) return "upcoming";
    if (now > end) return "past";
    return "live";
  }
  return "live";
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const activeRes = await fetch(`${BASE}/v1/clans/players`, {
      cache: "no-store",
    });

    if (!activeRes.ok) {
      return NextResponse.json(
        {
          success: false,
          active: false,
          error: "PS99 players endpoint failed",
        },
        { status: 502 }
      );
    }

    const activeJson = await activeRes.json().catch(() => null);
    const battleId = pickBattleId(activeJson);

    if (!battleId) {
      return NextResponse.json({
        success: true,
        active: false,
        battleId: null,
        warName: null,
        startTime: null,
        endTime: null,
        durationSeconds: null,
        state: "inactive",
        clanRank: null,
        totalClans: null,
        totalPoints: 0,
        participants: 0,
        maxParticipants: 0,
        progressPct: null,
        topContributor: null,
        rewards: {
          headlineReward: null,
          placementRewards: [],
          tieredRewards: null,
        },
      });
    }

    const battleRes = await fetch(
      `${BASE}/v1/clans/battles/${encodeURIComponent(battleId)}`,
      { cache: "no-store" }
    );

    if (!battleRes.ok) {
      return NextResponse.json(
        {
          success: false,
          active: false,
          error: "PS99 battle endpoint failed",
        },
        { status: 502 }
      );
    }

    const battleJson = await battleRes.json().catch(() => null);
    const data = battleJson?.data ?? {};
    const meta = data?.meta ?? {};
    const stats = data?.stats ?? {};

    const topClans = asArray(data?.topClans);
    const topPlayers = asArray(data?.topPlayers);

    const ourClan =
      findOurClan(topClans) ??
      data?.yourClan ??
      data?.clan ??
      data?.myClan ??
      null;

    const apiStartTime = toIsoTime(meta?.startTime ?? meta?.startedAt ?? meta?.start_at);
    const apiEndTime = toIsoTime(meta?.finishTime ?? meta?.endedAt ?? meta?.end_at);
    const warName = meta?.title ?? meta?.name ?? meta?.id ?? battleId;
    const rawState = deriveState(meta, apiStartTime, apiEndTime);
    const detectedWindow = rawState === "live"
      ? await getDetectedWarWindow({
          battleId,
          battleName: String(warName),
          apiStart: apiStartTime,
          apiEnd: apiEndTime,
        })
      : null;

    const startTime = detectedWindow?.startIso ?? apiStartTime;
    const endTime = detectedWindow?.endIso ?? apiEndTime;
    const startMs = startTime ? Date.parse(startTime) : null;
    const endMs = endTime ? Date.parse(endTime) : null;
    const durationSeconds =
      startMs !== null && endMs !== null && endMs > startMs
        ? Math.floor((endMs - startMs) / 1000)
        : asNumber(meta?.durationSeconds) ?? null;

    const progressPct =
      startMs !== null && endMs !== null && endMs > startMs
        ? Math.max(0, Math.min(100, ((Date.now() - startMs) / (endMs - startMs)) * 100))
        : null;

    const state = deriveState(meta, startTime, endTime);
    const topContributor = topPlayers[0] ?? null;
    const [mcwvStats, indexOverview, top50Clans] = await Promise.all([
      getMcwvBattleStats(battleId, warName),
      getBigGamesIndexClanOverview(),
      getTop50ClanLeaderboard(),
    ]);
    const mcwvTotalPoints =
      indexOverview?.points ??
      mcwvStats?.points ??
      getClanPoints(ourClan) ??
      asNumber(ourClan?.totalPoints) ??
      asNumber(ourClan?.TotalPoints) ??
      0;
    const mcwvParticipants = mcwvStats?.participants ?? asNumber(ourClan?.participants) ?? asNumber(ourClan?.contributors) ?? 0;
    const mcwvRank =
      indexOverview?.rank ??
      asNumber(ourClan?.reportedPlace) ??
      asNumber(ourClan?.rank) ??
      asNumber(ourClan?.place) ??
      asNumber(ourClan?.position) ??
      null;

    return NextResponse.json({
      success: true,
      active: state === "live" || Boolean(battleId),
      battleId,
      warName,
      startTime,
      endTime,
      durationSeconds,
      state,
      clanRank: mcwvRank,
      totalClans: asNumber(stats?.participatingClans) ?? asNumber(stats?.sampledClans) ?? topClans.length ?? 0,
      totalPoints: mcwvTotalPoints,
      participants: mcwvParticipants,
      maxParticipants: asNumber(stats?.sampledClans) ?? topClans.length ?? 0,
      progressPct,
      topContributor,
      rewards: {
        headlineReward: meta?.headlineReward ?? null,
        placementRewards: asArray(meta?.placementRewards),
        tieredRewards: meta?.tieredRewards ?? null,
      },
      leaderboard: {
        title: "Top 50 clans",
        clans: top50Clans,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        active: false,
        error: "WAR API CRASHED",
      },
      { status: 500 }
    );
  }
}
