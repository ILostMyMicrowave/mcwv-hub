import { Pool, type PoolConfig } from "pg"
import dns from "node:dns"

// Vercel’s serverless runtime prefers IPv6. Supabase’s pooler often only
// answers reliably on IPv4, which surfaces as:
//   Error: timeout exceeded when trying to connect
// Force IPv4-first lookups in this isolate before any client is created.
try {
  dns.setDefaultResultOrder("ipv4first")
} catch {
  // older runtimes - ignore
}

declare global {
  var _mcwv_pool: Pool | undefined
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
    code === "08006" || // connection_failure (e.g. closed mid-operation)
    code === "08001" || // sqlclient_unspecified
    code === "57P01" || // admin_shutdown
    code === "57P02" || // crash_shutdown
    code === "57P03" || // cannot_connect_now
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("Connection terminated") ||
    msg.includes("connection was closed in the middle of an operation") ||
    msg.includes("backend closed the connection unexpectedly") ||
    msg.includes("SSL SYSCALL error") ||
    msg.includes("unexpected response in SSL negotiation") ||
    msg.includes("sorry, too many clients") ||
    msg.includes("remaining connection slots")
  )
}

function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set")
  }

  const config: PoolConfig = {
    connectionString,
    // Per-isolate cap. Vercel must use Supabase *transaction* pooling
    // (port 6543 / pooler host). Session mode’s ~15 client cap will
    // otherwise time out every extra isolate.
    max: 1,
    // Keep a warm client a bit longer so login + navbar don’t each pay a
    // fresh TCP handshake. Still short enough that idle isolates release.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true, ca: undefined } : undefined,
  }

  const pool = new Pool(config)
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message)
  })

  const originalQuery = pool.query.bind(pool) as Pool["query"]

  // Supabase's pooler (and Vercel's per-isolate `max: 1`) can drop a cold
  // connection on the first use of an isolate. Retry transient errors a couple
  // of times with backoff before surfacing — this is what keeps
  // "Failed to verify authentication" 500s from spooking pages/assistant.
  const MAX_ATTEMPTS = 3
  const retryBackoffMs = (attempt: number) => Math.min(250 * 2 ** (attempt - 1), 1000)
  const retriedQuery = ((...args: unknown[]) => {
    const run = () => (originalQuery as (...inner: unknown[]) => Promise<unknown>)(...args)
    const attempt = async (n: number): Promise<unknown> => {
      try {
        return await run()
      } catch (err) {
        if (!isTransientDbError(err) || n >= MAX_ATTEMPTS) throw err
        const delay = retryBackoffMs(n)
        console.warn(
          `[db] transient error (attempt ${n}/${MAX_ATTEMPTS}), retrying in ${delay}ms:`,
          err instanceof Error ? err.message : err
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        return attempt(n + 1)
      }
    }
    return attempt(1)
  }) as Pool["query"]
  pool.query = retriedQuery

  return pool
}

// Reuse one pool across route modules that share the same serverless isolate.
// Separate isolates still get their own pool, which is why max must remain 1.
export const pool = global._mcwv_pool ?? getPool()
global._mcwv_pool = pool

export function isDbConnectTimeout(err: unknown) {
  return isTransientDbError(err)
}
