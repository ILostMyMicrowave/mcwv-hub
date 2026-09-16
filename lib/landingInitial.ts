import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";
import {
  readLeaderboardCache,
  isLeaderboardCacheFresh,
} from "@/lib/leaderboardCache";
import { getStoredPresence } from "@/lib/presence";
import { ensurePushTables } from "@/lib/pushServer";

/**
 * Server-rendered initial data for the landing page.
 *
 * The landing page used to be a pure client component: the HTML shell
 * arrived fast (edge-cached) but contained ZERO data — every number was
 * filled in 1–3 s later by 8 parallel client-side API calls (each hitting a
 * scale-to-zero Vercel function). Now the critical data is rendered into the
 * HTML on the server, so the page paints with real numbers on first frame.
 *
 * Design rules:
 *  - Everything is fail-soft: any slice that errors renders as null and the
 *    client component falls back to its normal fetch for that slice.
 *  - Only cheap reads run here: the leaderboard comes from the shared
 *    leaderboard_cache table (one JSONB read, no PS99 rebuild on the render
 *    path). The first visitor after a cold cache triggers the rebuild via the
 *    client's normal poll, which warms the cache for everyone.
 *  - Stored (bot-written) presence only — the live Roblox call stays
 *    client-side; it's external and can be slow.
 */

export type LandingInitialUser = {
  id: number;
  username: string;
  role: string;
  robloxId: string | null;
};

export type LandingInitialLeaderboard = {
  active: boolean;
  title: string;
  totalPoints: number;
  updatedAt: string;
  players: unknown[];
};

export type LandingInitial = {
  user: LandingInitialUser | null;
  unreadCount: number | null;
  settings: {
    discord_link: string;
    requirements_text: string;
    banner_text: string;
    banner_speed: number;
  } | null;
  presence: { status: string; tone: string } | null;
  leaderboard: LandingInitialLeaderboard | null;
};

async function loadUser(): Promise<LandingInitialUser | null> {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const userId = Number(session.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return null;

    const res = await pool.query<{
      id: number;
      username: string;
      role: string | null;
      roblox_id: string | null;
    }>(`SELECT id, username, role, roblox_id FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = res.rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      username: String(row.username ?? ""),
      role: row.role === "owner" || row.role === "officer" ? row.role : "member",
      robloxId: row.roblox_id === null || row.roblox_id === undefined ? null : String(row.roblox_id),
    };
  } catch {
    return null;
  }
}

async function loadLeaderboard(): Promise<LandingInitialLeaderboard | null> {
  try {
    const cached = await readLeaderboardCache();
    if (!cached) return null;

    const payload = cached.payload as {
      success?: boolean;
      active?: boolean;
      title?: string;
      total_points?: number;
      updatedAt?: string;
      data?: unknown[];
    };

    // Adaptive TTL: wars stay hot at 3 min, peacetime coasts at 10 min.
    if (!isLeaderboardCacheFresh(cached.ageMs, Boolean(payload?.active))) return null;

    if (!payload || !Array.isArray(payload.data)) return null;

    return {
      active: Boolean(payload.active),
      title: String(payload.title ?? ""),
      totalPoints: Number(payload.total_points ?? 0) || 0,
      updatedAt: String(payload.updatedAt ?? new Date(Date.now() - cached.ageMs).toISOString()),
      players: payload.data,
    };
  } catch {
    return null;
  }
}

async function loadSettings() {
  try {
    const res = await pool.query<{
      discord_link: string | null;
      requirements_text: string | null;
      banner_text: string | null;
      banner_speed: number | null;
    }>(
      `SELECT discord_link, requirements_text, banner_text, banner_speed
       FROM global_settings WHERE id = 1 LIMIT 1`
    );
    const row = res.rows[0];
    if (!row) return null;

    return {
      discord_link: row.discord_link ?? "",
      requirements_text: row.requirements_text ?? "",
      banner_text: row.banner_text ?? "",
      banner_speed: row.banner_speed ?? 18,
    };
  } catch {
    return null;
  }
}

async function loadUnreadCount(userId: number): Promise<number | null> {
  try {
    await ensurePushTables();
    const { rows } = await pool.query<{ unread: string }>(
      `SELECT COUNT(*)::text AS unread
       FROM notifications n
       WHERE (n.audience <> 'user' OR n.user_id = $1)
         AND n.id > COALESCE(
           (SELECT last_read_notif_id FROM alert_read_marker WHERE user_id = $1),
           0
         )`,
      [userId]
    );
    return Number(rows[0]?.unread ?? "0") || 0;
  } catch {
    return null;
  }
}

async function loadPresence(robloxId: string) {
  const stored = await getStoredPresence(robloxId);
  if (!stored) return null;
  return { status: stored.label, tone: stored.tone };
}

export async function getLandingInitial(): Promise<LandingInitial> {
  const user = await loadUser();

  const [leaderboard, settings, unread, presence] = await Promise.allSettled([
    loadLeaderboard(),
    loadSettings(),
    user ? loadUnreadCount(user.id) : Promise.resolve(null),
    user?.robloxId ? loadPresence(user.robloxId) : Promise.resolve(null),
  ]);

  return {
    user,
    unreadCount: unread.status === "fulfilled" ? unread.value : null,
    settings: settings.status === "fulfilled" ? settings.value : null,
    presence: presence.status === "fulfilled" ? presence.value : null,
    leaderboard: leaderboard.status === "fulfilled" ? leaderboard.value : null,
  };
}
