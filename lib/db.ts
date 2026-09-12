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

// pg 8.22 TRAP (prod 2026-09-12 root cause #1, verified locally against the
// exact lockfile version): ConnectionParameters builds its config with
//   Object.assign({}, config, parse(connectionString))
// — values parsed from the URL WIN over the explicit config object. Any
// sslmode/ssl* query param (Supabase pooler URLs ship with ?sslmode=require)
// is parsed into a FRESH ssl object that silently REPLACES the explicit
// ssl option below, dropping the CA bundle and reverting to the runtime's
// default trust store. pg-connection-string 2.14 treats sslmode=require as
// an alias of verify-full, so the result was full verification against the
// WRONG store → SELF_SIGNED_CERT_IN_CHAIN on every DB call. Strip the
// TLS-shaping params here so the ssl option below is the single source of
// truth for TLS (other params — pgbouncer, options, … — are preserved).
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
    connectionString: stripSslUrlParams(connectionString),
    // Per-isolate cap. Vercel must use Supabase *transaction* pooling
    // (port 6543 / pooler host). Session mode’s ~15 client cap will
    // otherwise time out every extra isolate.
    max: 1,
    // Keep a warm client for 5 minutes: app-status polls arrive every ~60s,
    // so anything shorter disconnects between polls and every poll pays a
    // fresh (lottery-prone) connect. Safe on TRANSACTION pooling (6543): an
    // idle client holds a supavisor client slot (cap 200) but no postgres
    // backend, and our concurrent warm-isolate count is single-digit.
    idleTimeoutMillis: 300_000,
    // Cold isolates regularly need >5s for the FIRST pooler connect — a fresh
    // isolate’s first DNS lookup of the pooler’s CNAME→ELB chain can take
    // seconds (prod 2026-09-12: attempt-1 timeout warnings every minute, the
    // immediate retry always succeeding, responseStatusCode 200 on each).
    // Give each attempt 10s; worst case 3 attempts + backoff ≈ 32s. The DNS
    // warm-up below removes most of that latency at the source.
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Let Vercel's platform recycle isolates itself. With `true`, pg exits
    // the isolate as soon as the pool goes idle — but the next 60s poll
    // then cold-boots a fresh isolate that must win the cold-connect lottery
    // again (see connectionTimeoutMillis note). Staying resident is free on
    // Fluid compute (billed on CPU, not wall-clock).
    allowExitOnIdle: false,
    // TLS (prod 2026-09-12 root cause #2): the pooler chain is
    //   *.pooler.supabase.com ← Supabase Intermediate 2021 CA ← Supabase
    //   Root 2021 CA — anchored at Supabase's OWN private root, which is in
    //   NO public trust store. A Mozilla-only bundle could never verify it.
    //   lib/ca.crt (inlined as DB_CA_PEM) now carries the Mozilla roots PLUS
    //   the Supabase pooler root, so rejectUnauthorized:true actually
    //   succeeds. NODE_EXTRA_CA_CERTS is no longer needed.
    // NOTE (Node semantics, verified experimentally): `ca` REPLACES the
    // default trust store for this connection — it is not additive. The
    // bundle must therefore contain every anchor on its own. If Supabase
    // rotates the pooler CA, re-extract it and regenerate with
    // scripts/dump-ca-cert.mjs. Other outbound HTTPS (bot API, PS99) uses
    // fetch/undici and is unaffected by this option.
    // Dev: apply the same TLS when the raw URL asked for it (its sslmode was
    // stripped above) or PGSSLMODE is set, so local dev against the real
    // pooler verifies against the same bundle instead of failing.
    ssl:
      process.env.NODE_ENV === "production" ||
      /[?&](sslmode|ssl|sslnegotiation|sslcert|sslkey|sslrootcert|sslpassword|sslsni)=/i.test(
        connectionString
      ) ||
      process.env.PGSSLMODE
        ? { rejectUnauthorized: true, ca: DB_CA_PEM }
        : undefined,
  }

  const pool = new Pool(config)
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message)
  })

  // Warm this isolate's DNS cache for the DB host before any request needs a
  // connection. A cold isolate's first getaddrinfo for the pooler's
  // CNAME→ELB chain can take seconds — exactly the budget the old 5s
  // connection timeout burned on attempt 1 (prod 2026-09-12). Fire-and-forget:
  // the resolver's cache makes the first real connect fast.
  try {
    const dbHost = new URL(connectionString).hostname
    if (dbHost) void dns.promises.lookup(dbHost).catch(() => {})
  } catch {
    // non-URL connection string — pg will surface the real error later
  }

  const originalQuery = pool.query.bind(pool) as Pool["query"]

  // Supabase's pooler (and Vercel's per-isolate `max: 1`) can drop a cold
  // connection on the first use of an isolate — or reject it outright with
  // EMAXCONNSESSION when the 15-client session pool is full. Retry transient
  // errors with backoff before surfacing: this is what keeps "Failed to
  // verify authentication" 500s from spooking pages/assistant.
  // Backoff gaps are deliberately wide (prod 2026-09-12): cold-connect
  // failures on Vercel come in correlated bursts lasting ~20-30s — retries
  // 400ms/1.5s later land inside the same burst and die too. 1s/3s pushes
  // the third attempt past the burst. Worst case ≈ 34s (3 × 10s timeout +
  // backoff), inside the observed function budget (32.6s response logged).
  const MAX_ATTEMPTS = 3
  const RETRY_BACKOFF_MS = [1_000, 3_000]
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
