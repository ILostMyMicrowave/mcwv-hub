export class BotAdminApiError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = "BotAdminApiError"
    this.status = status
  }
}

function getBotBaseUrl() {
  return (
    process.env.BOT_ADMIN_API_URL?.trim() ||
    process.env.BOT_API_URL?.trim() ||
    ""
  ).replace(/\/$/, "")
}

function getBotApiKey() {
  return (
    process.env.BOT_ADMIN_API_KEY?.trim() ||
    process.env.ADMIN_API_KEY?.trim() ||
    ""
  )
}

export function botAdminApiConfigured() {
  return Boolean(getBotBaseUrl() && getBotApiKey())
}

function normalizePath(path: string) {
  if (!path.startsWith("/")) return `/${path}`
  return path
}

export async function botAdminFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = getBotBaseUrl()
  const apiKey = getBotApiKey()

  if (!baseUrl || !apiKey) {
    throw new BotAdminApiError(
      "Bot admin API is not configured. Set BOT_ADMIN_API_URL and BOT_ADMIN_API_KEY.",
      503
    )
  }

  const controller = new AbortController()
  const timeout = windowlessSetTimeout(() => controller.abort(), 10_000)

  try {
    const headers = new Headers(init.headers)
    headers.set("Accept", "application/json")
    headers.set("X-Admin-API-Key", apiKey)

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    const res = await fetch(`${baseUrl}${normalizePath(path)}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      throw new BotAdminApiError(
        data?.error || data?.message || `Bot admin API failed with HTTP ${res.status}`,
        res.status
      )
    }

    return data as T
  } catch (err) {
    if (err instanceof BotAdminApiError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new BotAdminApiError("Bot admin API timed out", 504)
    }
    throw new BotAdminApiError(
      err instanceof Error ? err.message : "Bot admin API request failed",
      502
    )
  } finally {
    clearTimeout(timeout)
  }
}

function windowlessSetTimeout(handler: () => void, timeoutMs: number) {
  return setTimeout(handler, timeoutMs)
}

