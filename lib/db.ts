import { Pool } from "pg"

declare global {
  var _mcwv_pool: Pool | undefined
}

function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set")
  }

  return new Pool({
    connectionString,
    // This is a per-runtime limit, not a deployment-wide limit. Vercel must use
    // Supabase Transaction pooling; one client per isolate prevents a burst of
    // warm functions from consuming the session pool's entire 15-client cap.
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  })
}

// Reuse one pool across route modules that share the same serverless isolate.
// Separate isolates still get their own pool, which is why max must remain 1.
export const pool = global._mcwv_pool ?? getPool()
global._mcwv_pool = pool
