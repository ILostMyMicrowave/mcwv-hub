import { NextResponse } from "next/server"

import { requireAuthenticatedUser } from "@/lib/authUser"
import { buildAskerContext, getSharedWarContext, loadAskerWars } from "@/lib/warContext"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Slim feed for the AFK Room HUD: MCWV's clan placement + the viewer's points.
// Reuses the assistant's tested war-context plumbing; every field fails soft.

export async function GET() {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response

  try {
    const [shared, askerWars] = await Promise.all([
      getSharedWarContext(),
      loadAskerWars(auth.user.robloxId),
    ])
    const asker = buildAskerContext(auth.user, shared, askerWars)

    // Placement: during a war use the battle rank; between wars use the clan
    // leaderboard position (standings are live even then), falling back to the
    // last snapshot rank we hold.
    const clanName = "MCWV"
    const lbIndex = shared.standings.findIndex(
      (row) => row.name.toUpperCase() === clanName.toUpperCase()
    )
    const liveLbRank = lbIndex >= 0 ? lbIndex + 1 : null
    const rank = shared.active ? shared.clanRank : liveLbRank ?? shared.clanRank

    const mePoints = shared.active
      ? asker.points
      : (askerWars[0]?.points ?? asker.points)
    const meWar: "current" | "last" | null = shared.active
      ? "current"
      : askerWars.length > 0
        ? "last"
        : null

    return NextResponse.json(
      {
        ok: true,
        clan: { name: clanName, rank, points: shared.clanPoints },
        me: { username: auth.user.username, points: mePoints, war: meWar },
        battle: { active: shared.active, id: shared.battleId, endsAt: shared.endsAt },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    console.error("[afk] feed failed:", err)
    return NextResponse.json({ ok: false, error: "AFK feed had a wobble" }, { status: 500 })
  }
}
