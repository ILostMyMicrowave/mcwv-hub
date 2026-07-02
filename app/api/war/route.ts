import { NextResponse } from "next/server";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = "MCWV";

function toIsoTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  // Handles unix seconds or unix milliseconds
  const ms = n > 10_000_000_000 ? n : n * 1000;
  const date = new Date(ms);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
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
    topClans.find(
      (c) => String(c?.name ?? "").trim().toLowerCase() === target
    ) ??
    topClans.find(
      (c) => String(c?.tag ?? "").trim().toLowerCase() === target
    ) ??
    topClans.find(
      (c) => String(c?.clanTag ?? "").trim().toLowerCase() === target
    ) ??
    topClans.find(
      (c) => String(c?.clanName ?? "").trim().toLowerCase() === target
    ) ??
    null
  );
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
        warName: null,
        battleId: null,
        startTime: null,
        endTime: null,
        clanRank: null,
        totalClans: null,
        totalPoints: 0,
        participants: 0,
        maxParticipants: 75,
        topContributor: null,
        topClans: [],
        topPlayers: [],
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

    const topContributor = topPlayers[0] ?? null;

    return NextResponse.json({
      success: true,
      active: meta?.state === "live" || Boolean(battleId),

      warName: meta?.title ?? meta?.name ?? meta?.id ?? battleId,
      battleId,

      // Send ISO strings so the frontend can parse consistently
      startTime: toIsoTime(
        meta?.startTime ?? meta?.startedAt ?? meta?.start_at
      ),
      endTime: toIsoTime(
        meta?.finishTime ?? meta?.endedAt ?? meta?.end_at
      ),

      clanRank:
        ourClan?.rank ??
        ourClan?.reportedPlace ??
        ourClan?.place ??
        ourClan?.position ??
        null,

      totalClans: stats?.sampledClans ?? topClans.length ?? 0,
      totalPoints: stats?.totalClanPoints ?? stats?.points ?? 0,
      participants: stats?.participatingClans ?? stats?.contributors ?? 0,
      maxParticipants: stats?.sampledClans ?? 75,

      topContributor,
      topClans,
      topPlayers,
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
