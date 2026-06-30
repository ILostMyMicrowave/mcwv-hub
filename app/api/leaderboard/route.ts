import { NextResponse } from "next/server";

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;

type Battle = {
  StartTime?: number;
  FinishTime?: number;
  PointContributions?: {
    UserID: number;
    Points: number;
  }[];
};

export async function GET() {
  try {
    const warRes = await fetch(ACTIVE_BATTLE_API, { cache: "no-store" });
    const clanRes = await fetch(CLAN_API, { cache: "no-store" });

    if (!warRes.ok || !clanRes.ok) {
      return NextResponse.json({
        success: false,
        error: "API unavailable",
        data: [],
      });
    }

    const warData = await warRes.json();
    const clanData = await clanRes.json();

    const battles = (clanData?.data?.Battles ?? {}) as Record<string, Battle>;

    const now = Math.floor(Date.now() / 1000);

    let battle: Battle | null = null;

    for (const b of Object.values(battles)) {
      const start = b.StartTime ?? 0;
      const end = b.FinishTime ?? 0;

      if (start <= now && now <= end) {
        battle = b;
        break;
      }
    }

    if (!battle) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const contributions = (battle.PointContributions ?? [])
      .sort((a, b) => (b.Points ?? 0) - (a.Points ?? 0))
      .map((entry, index) => ({
        rank: index + 1,
        user_id: entry.UserID,
        points: entry.Points,
      }));

    return NextResponse.json({
      success: true,
      data: contributions,
    });

  } catch (err) {
    console.error("Leaderboard API error:", err);

    return NextResponse.json({
      success: false,
      error: "Internal server error",
      data: [],
    });
  }
}
