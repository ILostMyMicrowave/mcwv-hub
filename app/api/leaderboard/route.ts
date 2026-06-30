import { NextResponse } from "next/server";

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;

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

    // ---------------- BOT-STYLE WAR DETECTION ----------------
    const config = war_data?.data?.configData ?? {};

    const start = Number(config.StartTime ?? 0);
    const finish = Number(config.FinishTime ?? 0);

    const now = Math.floor(Date.now() / 1000);

    const isActive = start <= now && now <= finish;

    if (!isActive) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // ---------------- GET BATTLE ----------------
    const battle =
      clan_data?.data?.Battles
        ? Object.values(clan_data.data.Battles as any)[0]
        : null;

    if (!battle || !battle.PointContributions) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // ---------------- SORT CONTRIBUTIONS ----------------
    const contributions = battle.PointContributions
      .filter((e: any) => e && typeof e === "object")
      .sort((a: any, b: any) => (b.Points ?? 0) - (a.Points ?? 0))
      .map((entry: any, index: number) => ({
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
