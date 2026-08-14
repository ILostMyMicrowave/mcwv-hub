import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var _mcwv_pool: Pool | undefined
}

function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set")
  }

  return new Pool({
    connectionString,
    // Supabase session pooler caps at 15 total connections (EMAXCONNSESSION).
    // Keep this small: the bot holds ~1, and Vercel may run several warm lambdas.
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  })
}

export const pool = global._mcwv_pool ?? getPool()

if (process.env.NODE_ENV !== "production") {
  global._mcwv_pool = pool
}
