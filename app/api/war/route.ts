import { NextResponse } from "next/server";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = "MCWV"; // change this if needed

function toIsoTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  // Handles either unix seconds or unix milliseconds
  const ms = n > 10_000_000_000 ? n : n * 1000;
  const d = new Date(ms);

  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
    topClans.find((c) => String(c?.name ?? "").trim().toLowerCase() === target) ??
    topClans.find((c) => String(c?.tag ?? "").trim().toLowerCase() === target) ??
    topClans.find((c) => String(c?.clanTag ?? "").trim().toLowerCase() === target) ??
    topClans.find((c) => String(c?.clanName ?? "").trim().toLowerCase() === target) ??
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
          error: "Failed to load PS99 active battle config",
        },
        { status: 502 }
      );
    }

    const activeJson = await activeRes.json();
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
          error: "Failed to load PS99 battle details",
        },
        { status: 502 }
      );
    }

    const battleJson = await battleRes.json();
    const data = battleJson?.data ?? {};
    const meta = data?.meta ?? {};
    const stats = data?.stats ?? {};
    const topClans = asArray(data?.topClans);
    const topPlayers = asArray(data?.topPlayers);

    const ourClan = findOurClan(topClans);
    const topContributor = topPlayers[0] ?? null;

    return NextResponse.json({
      success: true,
      active: meta?.state === "live" || Boolean(battleId),
      warName: meta?.title ?? meta?.name ?? battleId,
      battleId,

      startTime: toIsoTime(meta?.startTime ?? meta?.startedAt ?? meta?.start_at),
      endTime: toIsoTime(meta?.finishTime ?? meta?.endedAt ?? meta?.end_at),

      // PS99 clan endpoints are sampled, so this rank is relative to the sampled battle data.
      clanRank:
        ourClan?.rank ??
        ourClan?.reportedPlace ??
        ourClan?.place ??
        null,

      totalClans:
        stats?.sampledClans ??
        topClans.length ??
        null,

      totalPoints:
        stats?.totalClanPoints ??
        stats?.points ??
        0,

      participants:
        stats?.participatingClans ??
        stats?.contributors ??
        0,

      maxParticipants:
        stats?.sampledClans ??
        100,

      topContributor,
      topClans,
      topPlayers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Unexpected PS99 API error",
      },
      { status: 500 }
    );
  }
}
