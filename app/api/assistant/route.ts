import { NextResponse } from "next/server"

import { requireAuthenticatedUser } from "@/lib/authUser"
import { answerWithEngine, fallbackAnswer } from "@/lib/assistantEngine"
import { buildAskerContext, getSharedWarContext } from "@/lib/warContext"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// MCWV War Assistant — rules-engine only. No AI providers, no keys, no quota.
// The engine answers from live war data instantly; anything else gets the
// playbook summary. Zero cost, zero external calls, always available.

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; context?: unknown }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : ""
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }
  const rawTopic =
    body.context && typeof body.context === "object"
      ? ((body.context as { topic?: unknown }).topic ?? "")
      : ""
  const topic = typeof rawTopic === "string" && /^[a-z0-9:_-]{1,60}$/i.test(rawTopic) ? rawTopic : undefined

  const officer = auth.user.role === "officer" || auth.user.role === "owner"

  try {
    const shared = await getSharedWarContext()
    const asker = buildAskerContext(auth.user, shared)

    // 1) Instant, free, always-correct answers.
    const engine = answerWithEngine(message, shared, asker, officer, topic)
    if (engine.handled) {
      return NextResponse.json({
        reply: engine.text,
        chips: engine.chips,
        source: "instant",
        topic: engine.topic ?? null,
        card: engine.card ?? null,
      })
    }

    // 2) Unmatched → the playbook summary. Always lands on something useful.
    const fallback = fallbackAnswer(shared, asker)
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
