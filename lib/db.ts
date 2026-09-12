import { Pool, type PoolConfig } from "pg"
import dns from "node:dns"
import { DB_CA_PEM } from "./caCert"

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
    msg.includes("remaining connection slots") ||
    // Supabase *session-mode* pooler (port 5432) rejects new clients once
    // pool_size (15) is reached: code XX000 (too generic to match alone) +
    // this exact message. Production hit this on every burst of Vercel
    // isolates -> 500s across auth/leaderboard/collector. Match the message.
    msg.includes("max clients reached")
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
    // fresh TCP handshake. Still short enough that idle isolates release
    // their session-pooler slot quickly (10s, not 30s) so a burst of
    // isolates recovers from EMAXCONNSESSION fast.
    idleTimeoutMillis: 10_000,
    // Fail a hung connection fast (5s, not 20s) so the retry budget below
    // can actually be used inside Vercel’s function timeout.
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
    // The Vercel serverless CA store predates the anchor for Supabase's
    // pooler chain, so verification fails with SELF_SIGNED_CERT_IN_CHAIN
    // without these roots (prod 2026-09-12: every DB call 500ed after the
    // NODE_EXTRA_CA_CERTS env var was removed — the A/B proves the missing
    // anchor is in lib/ca.crt, not in the runtime default store). The PEM is
    // inlined from lib/ca.crt (see lib/caCert.ts) so the trust anchor is
    // present in every isolate unconditionally — no env var, no
    // file-tracing dependency.
    // NOTE (Node semantics, verified experimentally): `ca` REPLACES the
    // default trust store for this connection — it is not additive. The
    // bundle must therefore contain the pooler's anchor on its own. If
    // Supabase ever rotates to a CA outside this bundle, regenerate with
    // scripts/dump-ca-cert.mjs. Other outbound HTTPS (bot API, PS99) uses
    // fetch/undici and is unaffected by this option.
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true, ca: DB_CA_PEM }
        : undefined,
  }

  const pool = new Pool(config)
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message)
  })

  const originalQuery = pool.query.bind(pool) as Pool["query"]

  // Supabase's pooler (and Vercel's per-isolate `max: 1`) can drop a cold
  // connection on the first use of an isolate — or reject it outright with
  // EMAXCONNSESSION when the 15-client session pool is full. Retry transient
  // errors with backoff before surfacing: this is what keeps "Failed to
  // verify authentication" 500s from spooking pages/assistant. The backoff
  // stretches past ~2.5s total because pool slots free only as other
  // isolates' connections idle out (a few seconds).
  const MAX_ATTEMPTS = 3
  const RETRY_BACKOFF_MS = [400, 1500]
  const retryBackoffMs = (attempt: number) => RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]
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
