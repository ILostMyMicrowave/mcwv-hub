import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import {
  MemberProfile,
  WarTimelinePoint,
  parseProfileView,
  parseInventoryView,
  parseGamepasses,
  fetchAccountView,
  robloxAvatarUrl,
} from "@/lib/profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// DB-backed stats cache so repeat page loads (and cold serverless isolates)
// are fast instead of hitting BIG Games for every member each time. Stats are
// stored as JSON keyed by roblox_id with a captured_at timestamp; anything
// newer than CACHE_TTL is served straight from the DB.
const CACHE_TTL = 10 * 60 * 1000; // 10 min
const STATS_CACHE_TABLE = "profile_stats_cache";

async function ensureStatsCacheTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${STATS_CACHE_TABLE} (
      roblox_id TEXT PRIMARY KEY,
      stats JSONB,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readStatsCache(robloxId: string): Promise<any | null> {
  try {
    const r = await pool.query(
      `SELECT stats, captured_at FROM ${STATS_CACHE_TABLE} WHERE roblox_id = $1`,
      [robloxId]
    );
    const row = r.rows[0];
    if (!row || !row.stats) return null;
    const age = Date.now() - new Date(row.captured_at).getTime();
    if (age > CACHE_TTL) return null;
    return row.stats;
  } catch {
    return null;
  }
}

async function writeStatsCache(robloxId: string, stats: any) {
  try {
    await pool.query(
      `INSERT INTO ${STATS_CACHE_TABLE} (roblox_id, stats, captured_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (roblox_id) DO UPDATE SET stats = EXCLUDED.stats, captured_at = NOW()`,
      [robloxId, JSON.stringify(stats)]
    );
  } catch {
    // non-fatal
  }
}

// Fetch + parse a single member's stats from BIG Games (used when cache misses).
async function fetchMemberStats(token: string, robloxId: string) {
  const [profileData, inventoryData, extendedData] = await Promise.all([
    fetchAccountView("profile", token),
    fetchAccountView("inventory", token),
    fetchAccountView("extendedProfile", token),
  ]);
  const pv = parseProfileView(profileData);
  const iv = parseInventoryView(inventoryData);
  const gp = parseGamepasses(extendedData);
  let robuxSpent: number | null = null;
  if (extendedData) {
    const n = Number(
      (extendedData as any)?.RobuxSpent ??
        (extendedData as any)?.LifetimeRobuxSpent ??
        (extendedData as any)?.robuxSpent
    );
    if (Number.isFinite(n)) robuxSpent = n;
  }
  const stats = { ...pv, ...iv, gamepasses: gp, robuxSpent };
  await recordGemSnapshot(robloxId, pv?.gems ?? null);
  return stats;
}

// Track each member's gems over time so we can show "Most Improved" (delta
// across the current war). We record a row whenever a member's gems are
// freshly fetched, but throttle to ~once per hour per member to avoid table
// bloat. The delta is the most recent snapshot minus the earliest snapshot
// within the lookback window.
const SNAPSHOT_TABLE = "player_gem_snapshots";

async function ensureSnapshotTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      roblox_id TEXT NOT NULL,
      gems BIGINT,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${SNAPSHOT_TABLE}_roblox_time_idx
    ON ${SNAPSHOT_TABLE} (roblox_id, captured_at)
  `);
}

// Record a gem snapshot for a member, but at most once per hour per member.
async function recordGemSnapshot(robloxId: string, gems: number | null) {
  if (!robloxId || gems === null || gems === undefined) return;
  try {
    const recent = await pool.query(
      `SELECT 1 FROM ${SNAPSHOT_TABLE}
       WHERE roblox_id = $1 AND captured_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
      [robloxId]
    );
    if (recent.rows.length) return;
    await pool.query(
      `INSERT INTO ${SNAPSHOT_TABLE} (roblox_id, gems, captured_at) VALUES ($1, $2, NOW())`,
      [robloxId, Math.round(gems)]
    );
  } catch {
    // non-fatal
  }
}

// Resolve the current/recent war window (battle_id + start + end) from the
// battles table, falling back to the most recent war_snapshots battle.
async function getWarWindow(): Promise<{ battleId: string | null; start: number; end: number } | null> {
  try {
    // Prefer a battle with start/end times from the battles table.
    const b = await pool.query(
      `SELECT battle_id, start_time, end_time
       FROM battles
       WHERE start_time IS NOT NULL
       ORDER BY COALESCE(end_time, start_time) DESC
       LIMIT 1`
    );
    if (b.rows[0]) {
      const now = Date.now();
      const start = b.rows[0].start_time ? new Date(b.rows[0].start_time).getTime() : now - 7 * 24 * 3600 * 1000;
      const end = b.rows[0].end_time ? new Date(b.rows[0].end_time).getTime() : now;
      return { battleId: String(b.rows[0].battle_id), start, end };
    }
    // Fallback: most recent battle in war_snapshots.
    const s = await pool.query(
      `SELECT battle_id, MIN(captured_at) AS start, MAX(captured_at) AS end
       FROM war_snapshots
       WHERE battle_id IS NOT NULL
       GROUP BY battle_id
       ORDER BY MAX(captured_at) DESC
       LIMIT 1`
    );
    if (s.rows[0]) {
      return {
        battleId: String(s.rows[0].battle_id),
        start: new Date(s.rows[0].start).getTime(),
        end: new Date(s.rows[0].end).getTime(),
      };
    }
  } catch {}
  return null;
}

// Compute each member's gem delta across the CURRENT WAR window (from war start
// to now / war end). "Most Improved" = who gained the most gems during the war.
async function loadGemDeltas(startMs: number, endMs: number): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  const startTs = new Date(startMs);
  const endTs = new Date(endMs);
  try {
    const rows = await pool.query(
      `SELECT roblox_id,
              (SELECT gems FROM ${SNAPSHOT_TABLE} s2
               WHERE s2.roblox_id = g.roblox_id AND s2.captured_at >= $1 AND s2.captured_at <= $2
               ORDER BY s2.captured_at ASC LIMIT 1) AS first_gems,
              (SELECT gems FROM ${SNAPSHOT_TABLE} s3
               WHERE s3.roblox_id = g.roblox_id AND s3.captured_at >= $1 AND s3.captured_at <= $2
               ORDER BY s3.captured_at DESC LIMIT 1) AS last_gems
       FROM (SELECT DISTINCT roblox_id FROM ${SNAPSHOT_TABLE}
             WHERE captured_at >= $1 AND captured_at <= $2) g`,
      [startTs, endTs]
    );
    for (const r of rows.rows) {
      const first = r.first_gems == null ? null : Number(r.first_gems);
      const last = r.last_gems == null ? null : Number(r.last_gems);
      if (first !== null && last !== null) deltas.set(String(r.roblox_id), last - first);
    }
  } catch {
    // non-fatal
  }
  return deltas;
}

function isStaff(role: string | undefined) {
  return role === "officer" || role === "owner";
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  if (!isStaff(auth.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1) Roster: all main-linked members.
    const usersRes = await pool.query(
      `SELECT id, username, roblox_id, discord_id, role
       FROM users
       WHERE roblox_id IS NOT NULL AND TRIM(CAST(roblox_id AS TEXT)) <> ''
       ORDER BY LOWER(username) ASC`
    );
    const rows = usersRes.rows;

    // 2) Connected sets: member tokens (by user_id) + applicant tokens (by discord_id).
    const connectedByUserId = new Set<string>();
    const connectedByDiscord = new Set<string>();
    const tokenByUserId = new Map<string, string>();
    const tokenByDiscord = new Map<string, string>();
    try {
      const t1 = await pool.query(
        `SELECT user_id, access_token FROM big_games_tokens WHERE access_token IS NOT NULL`
      );
      for (const r of t1.rows) {
        connectedByUserId.add(String(r.user_id));
        tokenByUserId.set(String(r.user_id), String(r.access_token));
      }
    } catch {}
    try {
      const t2 = await pool.query(
        `SELECT discord_id, access_token FROM big_games_discord_tokens WHERE access_token IS NOT NULL`
      );
      for (const r of t2.rows) {
        connectedByDiscord.add(String(r.discord_id));
        tokenByDiscord.set(String(r.discord_id), String(r.access_token));
      }
    } catch {}

    // 3) Current/recent war window + timeline (recent war only).
    const warWindow = await getWarWindow();
    let warTimeline: WarTimelinePoint[] = [];
    try {
      const snapExists = await pool.query(
        `SELECT to_regclass('public.war_snapshots') IS NOT NULL AS exists`
      );
      if (snapExists.rows[0]?.exists) {
        const snap = await pool.query(
          `SELECT rank, battle_points, captured_at
           FROM war_snapshots
           WHERE LOWER(clan_name) = LOWER('MCWV')
             AND battle_points IS NOT NULL
             AND ($1::text IS NULL OR battle_id = $1)
           ORDER BY captured_at ASC`,
          [warWindow?.battleId ?? null]
        );
        warTimeline = snap.rows.map((r) => ({
          time: new Date(r.captured_at).getTime(),
          rank: r.rank == null ? null : Number(r.rank),
          points: Number(r.battle_points),
        }));
      }
    } catch {}

    // 4) Gem snapshot + DB stats-cache support. Delta = change across the war.
    await ensureSnapshotTable();
    await ensureStatsCacheTable();
    const warStart = warWindow?.start ?? Date.now() - 7 * 24 * 3600 * 1000;
    const warEnd = warWindow?.end ?? Date.now();
    const gemDeltas = await loadGemDeltas(warStart, warEnd);

    // 5) Per-member stats — PARALLEL so a roster of many members loads fast.
    const memberTasks = rows.map(async (row) => {
      const id = String(row.id);
      const robloxId = String(row.roblox_id).trim();
      const discordId = row.discord_id == null ? null : String(row.discord_id);
      const username = String(row.username || robloxId);

      let token: string | null = null;
      if (tokenByUserId.has(id)) token = tokenByUserId.get(id)!;
      else if (discordId && tokenByDiscord.has(discordId)) token = tokenByDiscord.get(discordId)!;
      const connected = Boolean(token);

      let stats: any = null;
      if (connected && token) {
        stats = await readStatsCache(robloxId || id);
        if (!stats) {
          stats = await fetchMemberStats(token, robloxId || id);
          if (stats) await writeStatsCache(robloxId || id, stats);
        }
      }

      return {
        robloxId,
        username,
        discordId,
        role: (row.role as MemberProfile["role"]) || "member",
        connected,
        avatarUrl: robloxAvatarUrl(robloxId),
        gems: stats?.gems ?? null,
        masteryAverage: stats?.masteryAverage ?? null,
        rank: stats?.rank ?? null,
        rankStars: stats?.rankStars ?? null,
        rebirths: stats?.rebirths ?? null,
        eggsHatched: stats?.eggsHatched ?? null,
        totalSessions: stats?.totalSessions ?? null,
        zonesUnlocked: stats?.zonesUnlocked ?? null,
        achievementsCount: stats?.achievementsCount ?? null,
        goalsCompleted: stats?.goalsCompleted ?? null,
        boothDiamondsEarned: stats?.boothDiamondsEarned ?? null,
        robuxSpent: stats?.robuxSpent ?? null,
        firstJoin: stats?.firstJoin ?? null,
        lastJoin: stats?.lastJoin ?? null,
        mastery: stats?.mastery ?? null,
        gemDelta: gemDeltas.get(robloxId) ?? null,
        gamepasses: stats?.gamepasses ?? [],
        equippedPets: stats?.equippedPets ?? [],
        ultimate: stats?.ultimate ?? null,
        hoverboard: stats?.hoverboard ?? null,
        booth: stats?.booth ?? null,
      } as MemberProfile;
    });
    const members = await Promise.all(memberTasks);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      war: warWindow
        ? { battleId: warWindow.battleId, start: new Date(warStart).toISOString(), end: new Date(warEnd).toISOString() }
        : null,
      members,
      warTimeline,
    });
  } catch (err) {
    console.error("[war/profiles] error:", err);
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}
