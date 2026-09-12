import { pool } from "@/lib/db";

/**
 * Shared Roblox presence helpers — used by /api/presence/me and by the
 * server-rendered landing page. Behavior matches the original route code.
 */

const ROBLOX_PRESENCE_API = "https://presence.roblox.com/v1/presence/users";

export type NormalizedPresence = {
  label: string;
  tone: "offline" | "online" | "ingame" | "studio" | "unknown" | string;
};

export function normalizePresence(value: unknown): NormalizedPresence {
  const raw = String(value ?? "").trim();
  const numeric = Number(value);

  if (numeric === 0) return { label: "Offline", tone: "offline" };
  if (numeric === 1) return { label: "Online", tone: "online" };
  if (numeric === 2) return { label: "In Game", tone: "ingame" };
  if (numeric === 3) return { label: "In Studio", tone: "studio" };

  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "offline") return { label: "Offline", tone: "offline" };
  if (normalized === "online") return { label: "Online", tone: "online" };
  if (normalized === "ingame" || normalized === "game") return { label: "In Game", tone: "ingame" };
  if (normalized === "instudio" || normalized === "studio") return { label: "In Studio", tone: "studio" };

  return { label: raw || "Unknown", tone: "unknown" };
}

/**
 * Last-known presence written by the bot (user_status table). Fails soft:
 * returns null when the table is missing or the query errors.
 */
export async function getStoredPresence(robloxId: string) {
  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.user_status') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) return null;

    const result = await pool.query<{ status: unknown; updated_at: Date | string | null }>(
      `SELECT status, updated_at
       FROM user_status
       WHERE roblox_id::text = $1
       LIMIT 1`,
      [robloxId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      ...normalizePresence(row.status),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      source: "stored",
    };
  } catch {
    return null;
  }
}

/**
 * Live presence from Roblox. 1.5 s hard timeout — a slow/hung Roblox API
 * must never stall a page render; callers fall back to stored presence.
 */
export async function getLivePresence(robloxId: string) {
  try {
    const res = await fetch(ROBLOX_PRESENCE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [Number(robloxId)] }),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });

    if (!res.ok) return null;

    const json = await res.json().catch(() => ({}));
    const presence = Array.isArray(json?.userPresences) ? json.userPresences[0] : null;
    if (!presence) return null;

    return {
      ...normalizePresence(presence.userPresenceType),
      location: presence.lastLocation || null,
      updatedAt: presence.lastOnline || new Date().toISOString(),
      source: "live",
    };
  } catch {
    return null;
  }
}
