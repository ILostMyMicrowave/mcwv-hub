import { NextResponse } from "next/server"

import { requireAuthenticatedUser } from "@/lib/authUser"
import { answerWithEngine, fallbackAnswer } from "@/lib/assistantEngine"
import { buildAskerContext, getSharedWarContext, loadAskerWars, type AskerWar } from "@/lib/warContext"
import { swrCached } from "@/lib/swrCache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// MCWV War Assistant — rules-engine only. No AI providers, no keys, no quota.
// The engine answers from live war data instantly; anything else gets the
// playbook summary. Zero cost, zero external calls, always available.

// The asker's war history is a non-trivial query and only changes when a war
// ends, so serve it per user from the shared SWR cache (60s fresh, 5min
// stale) instead of paying the query on every message.
function loadAskerWarsCached(robloxId: string | null): Promise<AskerWar[]> {
  if (!robloxId) return Promise.resolve([])
  return swrCached(`asker-wars:${robloxId}`, 60_000, 5 * 60_000, () => loadAskerWars(robloxId))
}

// GET: warm-up. The assistant is used in bursts, so its isolate is almost
// always cold when a member opens the bubble — every first message used to
// pay a cold boot plus a full shared-context rebuild. The bubble fires this
// GET on page load, hover, open and tab-focus, so the isolate AND the war
// context cache are hot before the first real message. Authed like POST and
// returns no data beyond { ok }.
export async function GET() {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response

  try {
    await Promise.all([getSharedWarContext(), loadAskerWarsCached(auth.user.robloxId)])
  } catch {
    // Warming is best-effort; a real POST still builds on demand.
  }
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; context?: unknown }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : ""
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }
  const rawContext = body.context && typeof body.context === "object" ? (body.context as { topic?: unknown; page?: unknown }) : {}
  const rawTopic = rawContext.topic ?? ""
  const topic = typeof rawTopic === "string" && /^[a-z0-9:_-]{1,60}$/i.test(rawTopic) ? rawTopic : undefined
  // The page the member is on (pathname): lets the engine tailor chips to
  // context ("Who's surging?" on /leaderboard, projection on /war-info...).
  const rawPage = rawContext.page ?? ""
  const page = typeof rawPage === "string" && /^\/?[a-z0-9/_-]{0,60}$/i.test(rawPage) ? rawPage : undefined

  const officer = auth.user.role === "officer" || auth.user.role === "owner"

  try {
    const [shared, askerWars] = await Promise.all([
      getSharedWarContext(),
      loadAskerWarsCached(auth.user.robloxId),
    ])
    const asker = buildAskerContext(auth.user, shared, askerWars)

    // 1) Instant, free, always-correct answers.
    const engine = answerWithEngine(message, shared, asker, officer, topic, page)
    if (engine.handled) {
      return NextResponse.json({
        reply: engine.text,
        chips: engine.chips,
        source: "instant",
        topic: engine.topic ?? null,
        card: engine.card ?? null,
      })
    }

    // 2) Unmatched → the playbook summary, plus a "did you mean" suggestion
    // when the words clearly point at a known question.
    const fallback = fallbackAnswer(shared, asker, engine.suggestion ?? null, page)
    return NextResponse.json({
      reply: fallback.text,
      chips: fallback.chips,
      source: "fallback",
      topic: null,
    })
  } catch (err) {
    console.error("[assistant] failed:", err)
    return NextResponse.json({ error: "Assistant had a wobble — try again in a sec" }, { status: 500 })
  }
}
