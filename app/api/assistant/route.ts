import { NextResponse } from "next/server"
import { requireAuthenticatedUser } from "@/lib/authUser"
import { pool } from "@/lib/db"
import { answerWithEngine, fallbackAnswer } from "@/lib/assistantEngine"
import { buildAskerContext, getSharedWarContext, packForPrompt } from "@/lib/warContext"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ""
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const DAILY_AI_LIMIT = Math.max(0, Number(process.env.ASSISTANT_DAILY_AI_LIMIT ?? "10") || 10)

const MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] as const

const SYSTEM_PROMPT = `You are the MCWV War Assistant, the in-house war-room bot of the Pet Simulator 99 clan MCWV.
Answer using ONLY the JSON context below — it contains live clan war data (rank, points, gaps, rewards, members) plus the asker's own stats.

Rules:
- NEVER invent numbers, names or rewards. If the context doesn't contain the answer, say so and suggest a related question instead.
- Keep replies under 120 words, hype but helpful, light emoji, casual tone.
- Only reveal officer-only data if the context includes an "officersOnly" block — otherwise coldly refuse to name zero-pointers and tell them to ask an officer.
- No links, no talk about APIs, databases, keys, or how you work inside.
- No war is live if context says active=false — say we're between wars.`

let usageTableReady = false

async function ensureUsageTable() {
  if (usageTableReady) return
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assistant_daily_usage (
        user_id INTEGER NOT NULL,
        day DATE NOT NULL,
        ai_used INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      )
    `)
    usageTableReady = true
  } catch (err) {
    console.error("[assistant] usage table failed:", err)
  }
}

async function getDailyAiUsed(userId: number): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT ai_used FROM assistant_daily_usage WHERE user_id = $1 AND day = CURRENT_DATE`,
      [userId]
    )
    return Number(result.rows[0]?.ai_used ?? 0)
  } catch {
    return 0
  }
}

async function bumpDailyAiUsed(userId: number) {
  try {
    await pool.query(
      `INSERT INTO assistant_daily_usage (user_id, day, ai_used)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET ai_used = assistant_daily_usage.ai_used + 1`,
      [userId]
    )
  } catch (err) {
    console.error("[assistant] usage bump failed:", err)
  }
}

function stripLinks(text: string) {
  return text.replace(/https?:\/\/\S+|www\.\S+/gi, "[link removed]").trim()
}

async function askGroq(model: string, question: string, context: unknown): Promise<string | null> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 280,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `CONTEXT:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    })

    if (!res.ok) {
      console.warn(`[assistant] groq ${model} HTTP ${res.status}`)
      return null
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content
    return typeof content === "string" && content.trim() ? content.trim() : null
  } catch (err) {
    console.warn(`[assistant] groq ${model} failed:`, err)
    return null
  }
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as { message?: unknown }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : ""
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }

  const officer = auth.user.role === "officer" || auth.user.role === "owner"

  try {
    const shared = await getSharedWarContext()
    const asker = buildAskerContext(auth.user, shared)

    // 1) Instant, free, always-correct answers.
    const engine = answerWithEngine(message, shared, asker, officer)
    if (engine.handled) {
      const greeting = message === "__hello__"
      return NextResponse.json({
        reply: engine.text,
        chips: engine.chips,
        source: "instant",
        aiRemaining: greeting || !GROQ_API_KEY ? null : Math.max(0, DAILY_AI_LIMIT - (await getDailyAiUsed(auth.user.id))),
      })
    }

    // 2) Free-text the engine didn't recognise → Groq (if configured + under cap).
    if (GROQ_API_KEY && DAILY_AI_LIMIT > 0) {
      await ensureUsageTable()
      const used = await getDailyAiUsed(auth.user.id)

      if (used < DAILY_AI_LIMIT) {
        const context = packForPrompt(shared, asker, officer)
        for (const model of MODELS) {
          const answer = await askGroq(model, message, context)
          if (answer) {
            await bumpDailyAiUsed(auth.user.id)
            return NextResponse.json({
              reply: stripLinks(answer).slice(0, 1000),
              chips: ["How are we doing?", "What do we win?", "Who's carrying?"],
              source: model === MODELS[0] ? "groq-70b" : "groq-8b",
              aiRemaining: Math.max(0, DAILY_AI_LIMIT - used - 1),
            })
          }
        }
      } else {
        const engine2 = fallbackAnswer(shared, asker, "daily AI chat limit reached")
        return NextResponse.json({
          reply: engine2.text,
          chips: engine2.chips,
          source: "fallback",
          aiRemaining: 0,
        })
      }
    }

    // 3) Always land on something useful.
    const fallback = fallbackAnswer(shared, asker, GROQ_API_KEY ? "AI is resting" : "AI key not set")
    return NextResponse.json({
      reply: fallback.text,
      chips: fallback.chips,
      source: "fallback",
      aiRemaining: null,
    })
  } catch (err) {
    console.error("[assistant] failed:", err)
    return NextResponse.json({ error: "Assistant had a wobble — try again in a sec" }, { status: 500 })
  }
}
