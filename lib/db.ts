import { Pool, type PoolConfig } from "pg"
import dns from "node:dns"
import { DB_CA_PEM } from "./caCert"

// Vercel prefers IPv6, Supabase pooler often only answers on IPv4 reliably
try {
  dns.setDefaultResultOrder("ipv4first")
} catch {}

declare global {
  var _mcwv_pool: Pool | undefined
  var _mcwv_once: Map<string, Promise<void>> | undefined
}

const SSL_URL_PARAM = /^(sslmode|ssl|sslnegotiation|sslcert|sslkey|sslrootcert|sslpassword|sslsni)$/i

function stripSslUrlParams(connectionString: string): string {
  const q = connectionString.indexOf("?")
  if (q === -1) return connectionString
  const kept = [...new URLSearchParams(connectionString.slice(q + 1))].filter(
    ([key]) => !SSL_URL_PARAM.test(key)
  )
  const qs = new URLSearchParams(kept).toString()
  return qs ? `${connectionString.slice(0, q)}?${qs}` : connectionString.slice(0, q)
}

function isTransientDbError(err: unknown) {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : ""
  const msg = err instanceof Error ? err.message : String(err)
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ECONNABORTED" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "EAI_AGAIN" ||
    code === "08006" ||
    code === "08001" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("Connection terminated") ||
    msg.includes("connection was closed in the middle of an operation") ||
    msg.includes("backend closed the connection unexpectedly") ||
    msg.includes("SSL SYSCALL error") ||
    msg.includes("unexpected response in SSL negotiation") ||
    msg.includes("sorry, too many clients") ||
    msg.includes("remaining connection slots") ||
    msg.includes("max clients reached")
  )
}

function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set")
  }

  // IMPORTANT: Use Supabase TRANSACTION pooling (port 6543) + ?pgbouncer=true
  // Session mode (5432) has ~15 client cap and will ALWAYS timeout with Vercel's 50+ isolates
  const config: PoolConfig = {
    connectionString: stripSslUrlParams(connectionString),
    // Per-isolate cap: 5 is safe on transaction pooling (6543) — holds supavisor slot but no PG backend when idle
    // 5 * 40 isolates = 200 (Supabase pooler cap) — was 1, then 3, now 5 to reduce queue
    max: 5,
    // Keep warm for 10 min — matches quiet-hours gap, avoids cold-connect lottery every 5 min
    idleTimeoutMillis: 600_000,
    // FIX for "ALWAYS timeout": cold isolates need 5-10s for first DNS CNAME→ELB + TLS handshake Vercel US → Supabase EU
    // 3s was too short, so every cold isolate timed out on attempt 1 then succeeded on attempt 2 (your logs)
    // Give first attempt 10s so it usually succeeds, no warning spam
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    allowExitOnIdle: false,
    ssl:
      process.env.NODE_ENV === "production" ||
      /[?&](sslmode|ssl|sslnegotiation|sslcert|sslkey|sslrootcert|sslpassword|sslsni)=/i.test(connectionString) ||
      process.env.PGSSLMODE
        ? { rejectUnauthorized: true, ca: DB_CA_PEM }
        : undefined,
  }

  const pool = new Pool(config)
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message)
  })

  // Warm DNS + establish first client NOW with retry, so first real request doesn't pay the lottery
  // Fire-and-forget but with its own retry loop
  const warm = async () => {
    try {
      const dbHost = new URL(connectionString).hostname
      if (dbHost) {
        try {
          await dns.promises.lookup(dbHost)
        } catch {}
      }
    } catch {}
    // Try to get a client early — if it fails, the normal query retry will handle it
    for (let i = 0; i < 2; i++) {
      try {
        const client = await pool.connect()
        await client.query("SELECT 1")
        client.release()
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500 + i * 500))
      }
    }
  }
  void warm()

  const originalQuery = pool.query.bind(pool) as Pool["query"]

  const MAX_ATTEMPTS = 3
  const CONNECT_TIMEOUT_MAX_ATTEMPTS = 4
  const RETRY_BACKOFF_MS = [500, 1_000, 2_000, 4_000]
  const RETRY_JITTER_RATIO = 0.35
  const retryBackoffMs = (attempt: number) => {
    const base = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]
    const jittered = base * (1 - RETRY_JITTER_RATIO + Math.random() * RETRY_JITTER_RATIO * 2)
    return Math.round(jittered)
  }
  const isConnectPhaseError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    return (
      msg.includes("timeout exceeded when trying to connect") ||
      msg.includes("Connection terminated due to connection timeout")
    )
  }
  const retriedQuery = ((...args: unknown[]) => {
    const run = () => (originalQuery as (...inner: unknown[]) => Promise<unknown>)(...args)
    const attempt = async (n: number): Promise<unknown> => {
      try {
        return await run()
      } catch (err) {
        const attemptLimit = isConnectPhaseError(err) ? CONNECT_TIMEOUT_MAX_ATTEMPTS : MAX_ATTEMPTS
        if (!isTransientDbError(err) || n >= attemptLimit) throw err
        const delay = retryBackoffMs(n)
        console.warn(`[db] transient error (attempt ${n}/${attemptLimit}), retrying in ${delay}ms:`, err instanceof Error ? err.message : err)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return attempt(n + 1)
      }
    }
    return attempt(1)
  }) as Pool["query"]
  pool.query = retriedQuery

  // Keepalive ping every 60s to keep socket alive — ~50 bytes
  const pingDb = () => void pool.query("SELECT 1").catch(() => {})
  const connectionKeepAlive = setInterval(pingDb, 60_000)
  connectionKeepAlive.unref()

  return pool
}

export const pool = global._mcwv_pool ?? getPool()
global._mcwv_pool = pool

const onceMap = (global._mcwv_once ??= new Map<string, Promise<void>>())
export function oncePerIsolate(key: string, run: () => Promise<void>): Promise<void> {
  let pending = onceMap.get(key)
  if (!pending) {
    pending = run().catch((err) => {
      onceMap.delete(key)
      throw err
    })
    onceMap.set(key, pending)
  }
  return pending
}

export function isDbConnectTimeout(err: unknown) {
  return isTransientDbError(err)
}
