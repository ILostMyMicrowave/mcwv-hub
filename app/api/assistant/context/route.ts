import { NextResponse } from "next/server"

import { requireAuthenticatedUser } from "@/lib/authUser"
import { buildAskerContext, getSharedWarContext, loadAskerWars, type AskerWar } from "@/lib/warContext"
import { swrCached } from "@/lib/swrCache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The assistant engine runs ENTIRELY in the browser now: every reply is
// computed client-side in ~0ms and messages never touch the network. This
// endpoint is the one thing the client needs from us: a single payload with
// the live shared war context plus the asking member's own stats. It is
// fetched on page load / bubble hover / panel open / tab focus, cached
// server-side (shared context in memory, asker history via swrCache), and
// the client keeps serving the last payload when a refresh fails.

// The asker's war history only changes when a war ends: cache per user.
function loadAskerWarsCached(robloxId: string | null): Promise<AskerWar[]> {
  if (!robloxId) return Promise.resolve([])
  return swrCached(`asker-wars:${robloxId}`, 60_000, 5 * 60_000, () => loadAskerWars(robloxId))
}

export async function GET() {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response

  try {
    const [shared, askerWars] = await Promise.all([
      getSharedWarContext(),
      loadAskerWarsCached(auth.user.robloxId),
    ])
    const asker = buildAskerContext(auth.user, shared, askerWars)
    const officer = auth.user.role === "officer" || auth.user.role === "owner"

    // Non-officers never receive the zero-score member names (the engine
    // shows them the count only, same as the old server-side answers).
    const payload = officer ? shared : { ...shared, zeroNames: [] as string[] }

    return NextResponse.json(
      { shared: payload, asker, officer, ts: Date.now() },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    console.error("[assistant] context failed:", err)
    return NextResponse.json({ error: "context unavailable" }, { status: 500 })
  }
}
