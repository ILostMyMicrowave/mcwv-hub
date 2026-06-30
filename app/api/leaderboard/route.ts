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
        error: "PS99 API unavailable",
        data: [],
      });
    }

    const war_data = await warRes.json();
    const clan_data = await clanRes.json();

    const war_config = war_data?.data?.configData ?? {};

    // SAFE battles handling
    const battlesRaw = clan_data?.data?.Battles;

    const battles: Record<string, Battle> =
      battlesRaw && typeof battlesRaw === "object"
        ? battlesRaw
        : {};

    const now = Math.floor(Date.now() / 1000);

    let battle: Battle | null = null;

    for (const b of Object.values(battles)) {
      if (!b || typeof b !== "object") continue;

      const start = Number(b.StartTime ?? 0);
      const end = Number(b.FinishTime ?? 0);

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
      .filter((e) => e && typeof e === "object")
      .sort((a, b) => (b.Points ?? 0) - (a.Points ?? 0))
      .map((entry, index) => ({
        rank: index + 1,
        user_id: Number(entry.UserID),
        points: Number(entry.Points ?? 0),
      }));

    return NextResponse.json({
      success: true,
      data: contributions,
    });

  } catch (err) {
    console.error("Leaderboard API ERROR:", err);

    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      data: [],
    });
  }
}
