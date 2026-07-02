import { NextResponse } from "next/server";

export async function GET() {
  // ⚔️ TEMP MOCK DATA (we replace later with real DB)
  return NextResponse.json({
    active: true,
    opponent: "EnemyClan",
    mcwv_points: 12450,
    enemy_points: 11800,
    ends_at: "2026-07-02T23:59:59Z",
  });
}
