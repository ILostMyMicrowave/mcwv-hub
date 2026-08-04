import { NextResponse } from "next/server"
import { requireAuthenticatedUser } from "@/lib/authUser"
import { pool } from "@/lib/db"
import { answerWithEngine, fallbackAnswer } from "@/lib/assistantEngine"
import { buildAskerContext, getSharedWarContext, packForPrompt } from "@/lib/warContext"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Provider-agnostic: any OpenAI-compatible chat-completions endpoint.
// Defaults to Groq (free tier); set ASSISTANT_AI_* to use GitHub Models,
// OpenRouter, Cerebras, etc. without touching this file.
const AI_API_KEY = process.env.ASSISTANT_AI_KEY ?? process.env.GROQ_API_KEY ?? ""
// Provider auto-detect: Cerebras keys start "csk-", OpenRouter "sk-or", Groq "gsk_". ASSISTANT_AI_BASE_URL overrides.
const IS_OPENROUTER = AI_API_KEY.startsWith("sk-or")
const DETECTED_BASE_URL = AI_API_KEY.startsWith("csk-")
  ? "https://api.cerebras.ai/v1/chat/completions"
  : IS_OPENROUTER
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions"
// Accept either ".../v1" or ".../v1/chat/completions" and normalize to the full path.
function normalizeChatUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "")
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`
}
const AI_BASE_URL = normalizeChatUrl(process.env.ASSISTANT_AI_BASE_URL ?? DETECTED_BASE_URL)
// Default cascade per detected provider (override with ASSISTANT_AI_MODELS).
// Cerebras free tier / OpenRouter :free pool (free models rotate — the doctor page shows what your key can use).
const DEFAULT_MODELS = IS_OPENROUTER
  ? "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-next-80b-a3b-instruct:free,google/gemma-4-31b-it:free,openai/gpt-oss-20b:free"
  : "zai-glm-4.7,qwen-3-32b,llama3.1-8b"
const AI_MODELS = (process.env.ASSISTANT_AI_MODELS ?? DEFAULT_MODELS)
  .split(",")
  .map((model) => model.trim().toLowerCase())
  .filter(Boolean)
const DAILY_AI_LIMIT = Math.max(0, Number(process.env.ASSISTANT_DAILY_AI_LIMIT ?? "10") || 10)

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

async function postChat(payload: Record<string, unknown>): Promise<Response> {
  return fetch(AI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  })
}

async function askModel(model: string, question: string, context: unknown): Promise<string | null> {
  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `CONTEXT:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
    ]
    let res = await postChat({ model, temperature: 0.4, max_tokens: 280, messages })

    if (!res.ok && res.status === 400) {
      // Picky model rejected optional params — retry with the bare minimum.
      console.warn(`[assistant] ${model} HTTP 400, retrying minimal payload`)
      res = await postChat({ model, messages })
    }

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 240)
      console.warn(`[assistant] ${model} HTTP ${res.status} via ${AI_BASE_URL} :: ${body}`)
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
        aiRemaining: greeting || !AI_API_KEY ? null : Math.max(0, DAILY_AI_LIMIT - (await getDailyAiUsed(auth.user.id))),
      })
    }

    // 2) Free-text the engine didn't recognise → AI provider (if configured + under cap).
    if (AI_API_KEY && DAILY_AI_LIMIT > 0) {
      await ensureUsageTable()
      const used = await getDailyAiUsed(auth.user.id)

      if (used < DAILY_AI_LIMIT) {
        const context = packForPrompt(shared, asker, officer)
        for (const model of AI_MODELS) {
          const answer = await askModel(model, message, context)
          if (answer) {
            await bumpDailyAiUsed(auth.user.id)
            return NextResponse.json({
              reply: stripLinks(answer).slice(0, 1000),
              chips: ["How are we doing?", "What do we win?", "Who's carrying?"],
              source: `ai:${model}`,
              aiRemaining: Math.max(0, DAILY_AI_LIMIT - used - 1),
            })
          }
        }
      } else {
        const engine2 = fallbackAnswer(shared, asker)
        return NextResponse.json({
          reply: engine2.text,
          chips: engine2.chips,
          source: "fallback",
          aiRemaining: 0,
        })
      }
    }

    // 3) Always land on something useful.
    const fallback = fallbackAnswer(shared, asker)
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
