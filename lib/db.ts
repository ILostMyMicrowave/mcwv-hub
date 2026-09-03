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
    code === "EAI_AGAIN" ||
    code === "57P01" ||
    code === "57P03" ||
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("Connection terminated") ||
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
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true, ca: process.env.NODE_EXTRA_CA_CERTS ? require('fs').readFileSync(process.env.NODE_EXTRA_CA_CERTS) : undefined } : undefined,
  }

  const pool = new Pool(config)
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message)
  })

  const originalQuery = pool.query.bind(pool) as Pool["query"]
  const retriedQuery = ((...args: unknown[]) => {
    const run = () => (originalQuery as (...inner: unknown[]) => Promise<unknown>)(...args)
    return Promise.resolve(run()).catch(async (err: unknown) => {
      if (!isTransientDbError(err)) throw err
      console.warn("[db] retrying query after:", err instanceof Error ? err.message : err)
      return run()
    })
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
