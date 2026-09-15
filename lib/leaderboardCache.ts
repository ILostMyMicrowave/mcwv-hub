import { oncePerIsolate, pool } from "@/lib/db";

/**
 * Instance-independent cache for the computed leaderboard payload.
 *
 * The route previously cached the built payload in function-instance memory
 * (3-minute TTL). Vercel scales function instances to zero, so the cache died
 * with the instance and the next visitor paid a full PS99 rebuild (~350 ms)
 * plus a fresh Supabase pooler connection. Persisting the payload in the DB
 * lets ANY instance — including a cold one — serve the board from a single
 * JSONB read and refresh in the background.
 */

const CACHE_KEY = "current";
// Egress: during a live war the board is hot, so keep the 3-minute TTL.
// In peacetime the board barely changes between rebuilds - the cached
// payload stays fresh for 10 minutes so idle polling stops re-reading it
// from Supabase on every isolate/TTL expiry.
const WAR_TTL_MS = 180 * 1000;
const PEACETIME_TTL_MS = 600 * 1000;

function ensureTable(): Promise<void> {
  return oncePerIsolate("leaderboard_cache", async () => {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS public.leaderboard_cache (
           key        TEXT PRIMARY KEY,
           payload    JSONB NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );
    } catch (err) {
      console.error("[leaderboard-cache] ensureTable failed:", err);
    }
  });
}

export type CachedLeaderboard = {
  payload: unknown;
  ageMs: number;
};

/**
 * Read the cached payload. Returns null on any failure or missing table so
 * the caller transparently falls back to building the board fresh.
 */
export async function readLeaderboardCache(): Promise<CachedLeaderboard | null> {
  try {
    await ensureTable();
    const res = await pool.query<{ payload: unknown; created_at: Date }>(
      `SELECT payload, created_at
       FROM public.leaderboard_cache
       WHERE key = $1
       LIMIT 1`,
      [CACHE_KEY]
    );
    const row = res.rows[0];
    if (!row) return null;

    const created = new Date(row.created_at).getTime();
    const ageMs = Date.now() - created;
    if (!Number.isFinite(ageMs) || ageMs < 0) return null;

    return { payload: row.payload, ageMs };
  } catch (err) {
    console.error("[leaderboard-cache] read failed:", err);
    return null;
  }
}

export function isLeaderboardCacheFresh(ageMs: number, active: boolean): boolean {
  return ageMs < (active ? WAR_TTL_MS : PEACETIME_TTL_MS);
}

/**
 * Upsert the built payload. Fire-and-forget safe: failures are logged, not
 * thrown — a cache-write failure must never break a request that already has
 * a valid payload.
 */
export async function writeLeaderboardCache(payload: unknown): Promise<void> {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO public.leaderboard_cache (key, payload, created_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET payload = EXCLUDED.payload, created_at = EXCLUDED.created_at`,
      [CACHE_KEY, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error("[leaderboard-cache] write failed:", err);
  }
}
