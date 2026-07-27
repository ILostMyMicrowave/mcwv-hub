import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getDetectedWarWindow } from "@/lib/warDetection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const CLAN_API = process.env.CLAN_API ?? "";
const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";

type UserRow = {
  id: number;
  username: string;
  roblox_id: string | number | null;
  role: string | null;
};

type VisitRow = {
  player_points: string | number | null;
  player_rank: string | number | null;
  clan_points: string | number | null;
  clan_rank: string | number | null;
  seen_at: Date | string;
};

type Contribution = {
  UserID?: number | string;
  Points?: number | string;
};

type Battle = {
  BattleID?: string;
  Title?: string;
  configName?: string;
  Points?: number | string;
  PointContributions?: Contribution[];
};

type ClanRow = {
  Name?: string;
  name?: string;
  Points?: number | string;
  points?: number | string;
};

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTimestamp(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed ${url}: HTTP ${res.status}`);
  return res.json();
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_war_visit_snapshots (
      user_id INTEGER NOT NULL,
      battle_id TEXT NOT NULL,
      roblox_id TEXT,
      player_points BIGINT,
      player_rank INTEGER,
      clan_points BIGINT,
      clan_rank INTEGER,
      seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, battle_id)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS user_war_visit_seen_idx ON user_war_visit_snapshots (user_id, seen_at DESC)`);
}

async function getSessionUser() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const userId = Number(session.user?.id);
  if (!Number.isFinite(userId)) return null;

  const result = await pool.query<UserRow>(
    `SELECT id, username, roblox_id, role
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function getActiveBattle() {
  const active = await fetchJson(`${PS99_API}/api/activeClanBattle`).catch(() => null);
  const data = active?.data ?? {};
  const config = data?.configData ?? {};
  const start = normalizeTimestamp(config.StartTime);
  const finish = normalizeTimestamp(config.FinishTime);
  const now = Math.floor(Date.now() / 1000);
  const isActive = start > 0 && finish > 0 ? start <= now && now <= finish : false;

  if (!isActive) return null;

  const title = String(config.Title ?? config.configName ?? data.configName ?? "Current Battle");
  const battleId = String(config._id ?? config.Title ?? data.configName ?? title);
  const window = await getDetectedWarWindow({
    battleId,
    battleName: title,
    apiStart: start > 0 ? start : null,
    apiEnd: finish > 0 ? finish : null,
  });

  return {
    battleId,
    title,
    start,
    finish,
    startIso: window?.startIso ?? (start ? new Date(start * 1000).toISOString() : null),
    endIso: window?.endIso ?? (finish ? new Date(finish * 1000).toISOString() : null),
  };
}

async function getCurrentBattleContributions(title: string) {
  if (!CLAN_API) return { entries: [] as Array<{ userId: number; points: number }>, total: 0 };

  const clan = await fetchJson(CLAN_API).catch(() => null);
  const battles = (clan?.data?.Battles ?? {}) as Record<string, Battle>;
  const target = normalizeKey(title);
  const match = Object.entries(battles).find(([key, battle]) => {
    const names = [key, battle?.BattleID, battle?.Title, battle?.configName];
    return names.some((name) => normalizeKey(name) === target);
  });

  const battle = match?.[1];
  const contributions = Array.isArray(battle?.PointContributions) ? battle.PointContributions : [];
  const entries = contributions
    .map((entry) => ({ userId: toNumber(entry.UserID), points: toNumber(entry.Points) }))
    .filter((entry) => entry.userId > 0)
    .sort((a, b) => b.points - a.points);

  return {
    entries,
    total: toNumber(battle?.Points) || entries.reduce((sum, entry) => sum + entry.points, 0),
  };
}

async function getClanRace(totalFallback: number) {
  const payload = await fetchJson(`${PS99_API}/api/clans?page=1&pageSize=100&sort=Points&sortOrder=desc`).catch(() => null);
  const rows = Array.isArray(payload?.data) ? (payload.data as ClanRow[]) : [];
  const mapped = rows.map((row, index) => ({
    rank: index + 1,
    name: String(row.Name ?? row.name ?? "Unknown"),
    points: toNumber(row.Points ?? row.points),
  }));
  const us = mapped.find((row) => normalizeKey(row.name) === normalizeKey(CLAN_NAME));
  const clanRank = us?.rank ?? null;
  const clanPoints = us?.points ?? totalFallback;
  const target = mapped
    .filter((row) => normalizeKey(row.name) !== normalizeKey(CLAN_NAME) && row.points > clanPoints)
    .sort((a, b) => a.points - b.points)[0] ?? null;
  const threat = mapped
    .filter((row) => normalizeKey(row.name) !== normalizeKey(CLAN_NAME) && row.points < clanPoints)
    .sort((a, b) => b.points - a.points)[0] ?? null;

  return {
    clanRank,
    clanPoints,
    target: target ? { name: target.name, rank: target.rank, points: target.points, gap: target.points - clanPoints + 1 } : null,
    threat: threat ? { name: threat.name, rank: threat.rank, points: threat.points, gap: clanPoints - threat.points + 1 } : null,
  };
}

async function playerRecentGains(robloxId: string, currentPoints: number) {
  const exists = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.player_leaderboard_history') IS NOT NULL AS exists`
  );
  if (!exists.rows[0]?.exists) return { lastHour: 0, last5m: 0 };

  const rows = await pool.query<{ points: string | number; captured_at: Date | string }>(
    `SELECT points, captured_at
     FROM player_leaderboard_history
     WHERE roblox_id::text = $1
       AND points IS NOT NULL
       AND captured_at >= NOW() - INTERVAL '2 hours'
     ORDER BY captured_at ASC`,
    [robloxId]
  );

  const latestMs = Date.now();
  const baseline = (minutes: number) => {
    const cutoff = latestMs - minutes * 60 * 1000;
    return [...rows.rows].reverse().find((row) => new Date(row.captured_at).getTime() <= cutoff) ?? rows.rows[0] ?? null;
  };

  const hour = baseline(60);
  const five = baseline(5);

  return {
    lastHour: hour ? Math.max(0, currentPoints - toNumber(hour.points)) : 0,
    last5m: five ? Math.max(0, currentPoints - toNumber(five.points)) : 0,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    if (debug) {
      if (user?.role !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        show: true,
        username: user.username,
        minutesSince: 27,
        previousSeenAt: new Date(Date.now() - 27 * 60 * 1000).toISOString(),
        battle: {
          battleId: "debug-war",
          title: "Debug War Recap",
        },
        player: {
          points: { before: 3450, now: 4120, delta: 670 },
          rank: { before: 17, now: 14, delta: 3 },
          lastHour: 420,
          last5m: 30,
        },
        clan: {
          points: { before: 52000, now: 56655, delta: 4655 },
          rank: { before: 29, now: 28, delta: 1 },
          target: { name: "PsAG", rank: 27, points: 56894, gap: 239 },
          threat: { name: "DDD9", rank: 29, points: 56557, gap: 98 },
        },
      });
    }

    if (!user?.roblox_id) {
      return NextResponse.json({ success: true, show: false, reason: "No linked Roblox account" });
    }

    const activeBattle = await getActiveBattle();
    if (!activeBattle) {
      return NextResponse.json({ success: true, show: false, reason: "No active war" });
    }

    const robloxId = String(user.roblox_id);
    const contributionData = await getCurrentBattleContributions(activeBattle.title);
    const playerIndex = contributionData.entries.findIndex((entry) => String(entry.userId) === robloxId);
    const player = playerIndex >= 0
      ? { points: contributionData.entries[playerIndex].points, rank: playerIndex + 1 }
      : { points: 0, rank: null as number | null };
    const gains = await playerRecentGains(robloxId, player.points);
    const clanRace = await getClanRace(contributionData.total);

    await ensureTable();

    const previousResult = await pool.query<VisitRow>(
      `SELECT player_points, player_rank, clan_points, clan_rank, seen_at
       FROM user_war_visit_snapshots
       WHERE user_id = $1
         AND battle_id = $2
       LIMIT 1`,
      [user.id, activeBattle.battleId]
    );

    const previous = previousResult.rows[0] ?? null;

    await pool.query(
      `INSERT INTO user_war_visit_snapshots (
         user_id,
         battle_id,
         roblox_id,
         player_points,
         player_rank,
         clan_points,
         clan_rank,
         seen_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, battle_id)
       DO UPDATE SET
         roblox_id = EXCLUDED.roblox_id,
         player_points = EXCLUDED.player_points,
         player_rank = EXCLUDED.player_rank,
         clan_points = EXCLUDED.clan_points,
         clan_rank = EXCLUDED.clan_rank,
         seen_at = NOW()`,
      [user.id, activeBattle.battleId, robloxId, player.points, player.rank, clanRace.clanPoints, clanRace.clanRank]
    );

    if (!previous) {
      return NextResponse.json({ success: true, show: false, reason: "First war visit baseline saved" });
    }

    const previousSeenAt = new Date(previous.seen_at).getTime();
    const minutesSince = Math.floor((Date.now() - previousSeenAt) / 60_000);
    if (minutesSince < 10) {
      return NextResponse.json({ success: true, show: false, reason: "Seen recently" });
    }

    const beforePlayerPoints = toNumber(previous.player_points);
    const beforePlayerRank = previous.player_rank === null ? null : toNumber(previous.player_rank);
    const beforeClanPoints = toNumber(previous.clan_points);
    const beforeClanRank = previous.clan_rank === null ? null : toNumber(previous.clan_rank);
    const playerPointDelta = player.points - beforePlayerPoints;
    const playerRankDelta = beforePlayerRank !== null && player.rank !== null ? beforePlayerRank - player.rank : null;
    const clanPointDelta = clanRace.clanPoints - beforeClanPoints;
    const clanRankDelta = beforeClanRank !== null && clanRace.clanRank !== null ? beforeClanRank - clanRace.clanRank : null;

    const meaningful = Math.abs(playerPointDelta) > 0 || Math.abs(clanPointDelta) > 0 || playerRankDelta !== 0 || clanRankDelta !== 0;

    return NextResponse.json({
      success: true,
      show: meaningful,
      battle: activeBattle,
      username: user.username,
      previousSeenAt: new Date(previous.seen_at).toISOString(),
      minutesSince,
      player: {
        points: { before: beforePlayerPoints, now: player.points, delta: playerPointDelta },
        rank: { before: beforePlayerRank, now: player.rank, delta: playerRankDelta },
        lastHour: gains.lastHour,
        last5m: gains.last5m,
      },
      clan: {
        points: { before: beforeClanPoints, now: clanRace.clanPoints, delta: clanPointDelta },
        rank: { before: beforeClanRank, now: clanRace.clanRank, delta: clanRankDelta },
        target: clanRace.target,
        threat: clanRace.threat,
      },
    });
  } catch (err) {
    console.error("[war/personal-recap] error:", err);
    return NextResponse.json({ success: true, show: false, reason: "Recap unavailable" });
  }
}
