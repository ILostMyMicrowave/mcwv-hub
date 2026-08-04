import { NextResponse } from "next/server"

import { requireAuthenticatedUser } from "@/lib/authUser"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Mirror of the config logic in app/api/assistant/route.ts — keep in sync.
const AI_API_KEY = process.env.ASSISTANT_AI_KEY ?? process.env.GROQ_API_KEY ?? ""
const DETECTED_PROVIDER = AI_API_KEY.startsWith("csk-")
  ? "cerebras"
  : AI_API_KEY.startsWith("gsk_")
    ? "groq"
    : AI_API_KEY
      ? "unknown-prefix"
      : "no-key"
const DETECTED_BASE_URL = AI_API_KEY.startsWith("csk-")
  ? "https://api.cerebras.ai/v1/chat/completions"
  : "https://api.groq.com/openai/v1/chat/completions"

function normalizeChatUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "")
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`
}

const AI_BASE_URL = normalizeChatUrl(process.env.ASSISTANT_AI_BASE_URL ?? DETECTED_BASE_URL)
const MODELS = (process.env.ASSISTANT_AI_MODELS ?? "zai-glm-4.7,qwen-3-32b,llama3.1-8b")
  .split(",")
  .map((model) => model.trim().toLowerCase())
  .filter(Boolean)

// GET /api/assistant-doctor — officer/owner-only live diagnostic.
// Pings every configured AI model with the real production config and reports raw results,
// so provider problems can be diagnosed from a browser instead of fishing through logs.
export async function GET() {
  const auth = await requireAuthenticatedUser()
  if (!auth.ok) return auth.response
  if (auth.user.role !== "officer" && auth.user.role !== "owner") {
    return NextResponse.json({ error: "officers and owners only" }, { status: 403 })
  }

  const results: Array<{
    model: string
    ok: boolean
    status: number
    ms: number
    detail: string
  }> = []

  if (!AI_API_KEY) {
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      verdict: "❌ No AI key configured (ASSISTANT_AI_KEY / GROQ_API_KEY are both unset)",
      keyPresent: false,
      baseUrl: AI_BASE_URL,
      models: MODELS,
      modelsFromEnv: Boolean(process.env.ASSISTANT_AI_MODELS),
      results,
    })
  }

  for (const model of MODELS) {
    const started = Date.now()
    try {
      const res = await fetch(AI_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with exactly: pong" }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 220)
      results.push({
        model,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - started,
        detail: res.ok ? "✅ answered" : body,
      })
    } catch (err) {
      results.push({
        model,
        ok: false,
        status: 0,
        ms: Date.now() - started,
        detail: `network/timeout: ${String(err).slice(0, 180)}`,
      })
    }
  }

  // Ask the provider which models THIS key can actually see.
  const modelsUrl = AI_BASE_URL.replace(/\/chat\/completions$/, "/models")
  let accountModels: string[] | null = null
  let accountModelsStatus = 0
  try {
    const res = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${AI_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    })
    accountModelsStatus = res.status
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null
      accountModels = (data?.data ?? [])
        .map((entry) => String(entry.id ?? ""))
        .filter(Boolean)
    }
  } catch {
    accountModelsStatus = -1
  }

  // If the account can see models we haven't tried, ping up to 5 of them too.
  const extraModels = (accountModels ?? []).filter((m) => !MODELS.includes(m)).slice(0, 5)
  for (const model of extraModels) {
    const started = Date.now()
    try {
      const res = await fetch(AI_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with exactly: pong" }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 220)
      results.push({
        model,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - started,
        detail: res.ok ? "✅ answered (account-visible extra)" : body,
      })
    } catch (err) {
      results.push({
        model,
        ok: false,
        status: 0,
        ms: Date.now() - started,
        detail: `network/timeout: ${String(err).slice(0, 180)}`,
      })
    }
  }

  const anyOk = results.some((r) => r.ok)
  const statuses = [...new Set(results.map((r) => r.status))]
  let verdict: string
  if (anyOk) {
    const winners = results.filter((r) => r.ok).map((r) => r.model)
    verdict = `✅ Working model(s) found! Put this in ASSISTANT_AI_MODELS (Production) and redeploy: ${winners.join(",")}`
  } else if (accountModels && accountModels.length === 0) {
    verdict =
      "🚫 The key's model list is EMPTY — the provider provisioned this account with zero usable models (free tier stuck). Check for a verification email / billing banner in the provider dashboard."
  } else if (accountModels) {
    verdict = `🔍 Your account can see ${accountModels.length} model(s) but none answered — see per-model statuses below.`
  } else {
    verdict = `⚠️ All configured models failed (statuses: ${statuses.join(", ")}) and the account model list couldn't be fetched (HTTP ${accountModelsStatus}).`
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    verdict,
    keyPresent: true,
    keyPrefixShown: `${AI_API_KEY.slice(0, 4)}… (not the real key)`,
    detectedProvider: DETECTED_PROVIDER,
    baseUrl: AI_BASE_URL,
    baseUrlFromEnv: Boolean(process.env.ASSISTANT_AI_BASE_URL),
    models: MODELS,
    modelsFromEnv: Boolean(process.env.ASSISTANT_AI_MODELS),
    dailyAiLimit: process.env.ASSISTANT_DAILY_AI_LIMIT ?? "10",
    accountModelsEndpoint: modelsUrl,
    accountModelsStatus,
    accountModels,
    results,
  })
}
