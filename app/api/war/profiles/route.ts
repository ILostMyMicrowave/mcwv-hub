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

// In-memory cache for the expensive per-member BIG Games fetches. The roster +
// connection status come straight from the DB on every request; only the live
// PS99 views (gems/mastery/rank/gamepasses/pets) are cached ~15 min to avoid
// hammering BIG Games rate limits.
const statsCache = new Map<string, { at: number; data: any }>();
const CACHE_TTL = 15 * 60 * 1000;

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

// Compute each member's gem delta across the last 14 days (proxy for the war).
async function loadGemDeltas(): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  try {
    const rows = await pool.query(
      `SELECT roblox_id,
              (SELECT gems FROM ${SNAPSHOT_TABLE} s2
               WHERE s2.roblox_id = g.roblox_id AND s2.captured_at > NOW() - INTERVAL '14 days'
               ORDER BY s2.captured_at ASC LIMIT 1) AS first_gems,
              (SELECT gems FROM ${SNAPSHOT_TABLE} s3
               WHERE s3.roblox_id = g.roblox_id AND s3.captured_at > NOW() - INTERVAL '14 days'
               ORDER BY s3.captured_at DESC LIMIT 1) AS last_gems
       FROM (SELECT DISTINCT roblox_id FROM ${SNAPSHOT_TABLE}
             WHERE captured_at > NOW() - INTERVAL '14 days') g`
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

    // 3) War timeline (current war placement from snapshots).
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
           ORDER BY captured_at ASC`
        );
        warTimeline = snap.rows.map((r) => ({
          time: new Date(r.captured_at).getTime(),
          rank: r.rank == null ? null : Number(r.rank),
          points: Number(r.battle_points),
        }));
      }
    } catch {}

    // 4) Gem snapshot support for "Most Improved".
    await ensureSnapshotTable();
    const gemDeltas = await loadGemDeltas();

    // 5) Per-member stats.
    const members: MemberProfile[] = [];
    for (const row of rows) {
      const id = String(row.id);
      const robloxId = String(row.roblox_id).trim();
      const discordId = row.discord_id == null ? null : String(row.discord_id);
      const username = String(row.username || robloxId);

      // Determine connection + token.
      let token: string | null = null;
      if (tokenByUserId.has(id)) token = tokenByUserId.get(id)!;
      else if (discordId && tokenByDiscord.has(discordId)) token = tokenByDiscord.get(discordId)!;
      const connected = Boolean(token);

      let stats: any = null;
      if (connected && token) {
        const cacheKey = robloxId || id;
        const cached = statsCache.get(cacheKey);
        if (cached && Date.now() - cached.at < CACHE_TTL) {
          stats = cached.data;
        } else {
          const [profileData, inventoryData, extendedData] = await Promise.all([
            fetchAccountView("profile", token),
            fetchAccountView("inventory", token),
            fetchAccountView("extendedProfile", token),
          ]);
          const pv = parseProfileView(profileData);
          const iv = parseInventoryView(inventoryData);
          const gp = parseGamepasses(extendedData);
          // Robux spent lives in extendedProfile (lifetime spend).
          let robuxSpent: number | null = null;
          if (extendedData) {
            const n = Number(
              (extendedData as any)?.RobuxSpent ??
                (extendedData as any)?.LifetimeRobuxSpent ??
                (extendedData as any)?.robuxSpent
            );
            if (Number.isFinite(n)) robuxSpent = n;
          }
          stats = { ...pv, ...iv, gamepasses: gp, robuxSpent };
          statsCache.set(cacheKey, { at: Date.now(), data: stats });
          await recordGemSnapshot(robloxId || id, pv?.gems ?? null);
        }
      }

      members.push({
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
      });
    }

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      members,
      warTimeline,
    });
  } catch (err) {
    console.error("[war/profiles] error:", err);
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}
