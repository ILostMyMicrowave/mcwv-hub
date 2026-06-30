import { NextResponse } from "next/server";

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;

export async function GET() {
  try {
    const warRes = await fetch(ACTIVE_BATTLE_API);
    const clanRes = await fetch(CLAN_API);

    if (!warRes.ok || !clanRes.ok) {
      return NextResponse.json({
        success: false,
        error: "API unavailable",
        data: []
      });
    }

    const war_data = await warRes.json();
    const clan_data = await clanRes.json();

    const war_config = war_data?.data?.configData ?? {};
    const battles = clan_data?.data?.Battles ?? {};

    // find active battle (same logic as bot helper)
    const now = Date.now() / 1000;

    let battle = null;

    for (const b of Object.values(battles)) {
      const start = b?.StartTime || 0;
      const end = b?.FinishTime || 0;

      if (start <= now && now <= end) {
        battle = b;
        break;
      }
    }

    if (!battle) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    const contributions = (battle.PointContributions || [])
      .sort((a, b) => (b.Points || 0) - (a.Points || 0))
      .map((e, i) => ({
        rank: i + 1,
        user_id: e.UserID,
        points: e.Points
      }));

    return NextResponse.json({
      success: true,
      data: contributions
    });

  } catch (err) {
    console.log("Leaderboard API error:", err);

    return NextResponse.json({
      success: false,
      data: []
    });
  }
}
