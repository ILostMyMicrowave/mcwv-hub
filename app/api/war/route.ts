import { NextResponse } from "next/server";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = "MCWV"; // change this if your clan name is different

export async function GET() {
  try {
    const activeRes = await fetch(`${BASE}/v1/clans/players`, {
      cache: "no-store",
    });

    if (!activeRes.ok) {
      return NextResponse.json(
        { error: "Failed to load PS99 active battle config" },
        { status: 502 }
      );
    }

    const activeJson = await activeRes.json();
    const battleId = activeJson?.data?.activeBattleConfigName;

    if (!battleId) {
      return NextResponse.json({
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

    const battleRes = await fetch(`${BASE}/v1/clans/battles/${battleId}`, {
      cache: "no-store",
    });

    if (!battleRes.ok) {
      return NextResponse.json(
        { error: "Failed to load PS99 battle details" },
        { status: 502 }
      );
    }

    const battleJson = await battleRes.json();
    const data = battleJson?.data ?? {};
    const meta = data?.meta ?? {};
    const stats = data?.stats ?? {};
    const topClans = Array.isArray(data?.topClans) ? data.topClans : [];
    const topPlayers = Array.isArray(data?.topPlayers) ? data.topPlayers : [];

    const ourClan =
      topClans.find(
        (c: any) =>
          String(c?.name ?? "").toLowerCase() === CLAN_NAME.toLowerCase()
      ) ?? null;

    return NextResponse.json({
      active: meta?.state === "live",
      warName: meta?.title ?? meta?.id ?? battleId,
      battleId,
      startTime: meta?.startTime
        ? new Date(meta.startTime * 1000).toISOString()
        : null,
      endTime: meta?.finishTime
        ? new Date(meta.finishTime * 1000).toISOString()
        : null,
      clanRank: ourClan?.reportedPlace ?? ourClan?.rank ?? null,
      totalClans: stats?.sampledClans ?? null,
      totalPoints: stats?.totalClanPoints ?? 0,
      participants: stats?.participatingClans ?? 0,
      maxParticipants: stats?.sampledClans ?? 100,
      topContributor: topPlayers[0] ?? null,
      topClans,
      topPlayers,
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected PS99 API error" },
      { status: 500 }
    );
  }
}
