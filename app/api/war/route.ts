import { NextResponse } from "next/server";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = "MCWV";

export async function GET() {
  try {
    // STEP 1: fetch battle list safely
    const activeRes = await fetch(`${BASE}/v1/clans/players`, {
      cache: "no-store",
    });

    if (!activeRes.ok) {
      return NextResponse.json({
        success: false,
        error: "PS99 players endpoint failed",
        active: false,
      });
    }

    const activeJson = await activeRes.json().catch(() => null);

    const battleId =
      activeJson?.data?.activeBattleConfigName ??
      activeJson?.activeBattleConfigName ??
      null;

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

    // STEP 2: fetch battle details safely
    const battleRes = await fetch(
      `${BASE}/v1/clans/battles/${battleId}`,
      { cache: "no-store" }
    );

    if (!battleRes.ok) {
      return NextResponse.json({
        success: false,
        error: "Battle endpoint failed",
        active: false,
      });
    }

    const battleJson = await battleRes.json().catch(() => null);

    const data = battleJson?.data ?? {};
    const meta = data?.meta ?? {};
    const stats = data?.stats ?? {};

    const topClans = Array.isArray(data?.topClans) ? data.topClans : [];
    const topPlayers = Array.isArray(data?.topPlayers) ? data.topPlayers : [];

    const ourClan = topClans.find((c: any) =>
      String(c?.name ?? "").toLowerCase() === CLAN_NAME.toLowerCase()
    );

    return NextResponse.json({
      success: true,

      active: meta?.state === "live",

      warName: meta?.title ?? battleId,

      battleId,

      // keep RAW unix if possible (safer for frontend)
      startTime: meta?.startTime ?? null,
      endTime: meta?.finishTime ?? null,

      clanRank: ourClan?.rank ?? null,
      totalClans: stats?.sampledClans ?? topClans.length ?? 0,

      totalPoints: stats?.totalClanPoints ?? 0,
      participants: stats?.participatingClans ?? 0,
      maxParticipants: stats?.sampledClans ?? 75,

      topContributor: topPlayers?.[0] ?? null,
      topClans,
      topPlayers,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "WAR API CRASHED",
        active: false,
      },
      { status: 500 }
    );
  }
}
