import { NextResponse } from "next/server";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = "MCWV";

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

    const startTime = toIsoTime(meta?.startTime ?? meta?.startedAt ?? meta?.start_at);
    const endTime = toIsoTime(meta?.finishTime ?? meta?.endedAt ?? meta?.end_at);

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

    return NextResponse.json({
      success: true,
      active: state === "live" || Boolean(battleId),
      battleId,
      warName: meta?.title ?? meta?.name ?? meta?.id ?? battleId,
      startTime,
      endTime,
      durationSeconds,
      state,
      clanRank:
        ourClan?.reportedPlace ??
        ourClan?.rank ??
        ourClan?.place ??
        ourClan?.position ??
        null,
      totalClans: asNumber(stats?.participatingClans) ?? asNumber(stats?.sampledClans) ?? topClans.length ?? 0,
      totalPoints: asNumber(stats?.totalClanPoints) ?? 0,
      participants: asNumber(stats?.totalContributors) ?? 0,
      maxParticipants: asNumber(stats?.sampledClans) ?? topClans.length ?? 0,
      progressPct,
      topContributor,
      rewards: {
        headlineReward: meta?.headlineReward ?? null,
        placementRewards: asArray(meta?.placementRewards),
        tieredRewards: meta?.tieredRewards ?? null,
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
