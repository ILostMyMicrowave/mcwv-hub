import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- CONFIG ---------------- */

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;

const ROBLOX_USERS_API = "https://users.roblox.com/v1/users";
const ROBLOX_THUMB_API =
  "https://thumbnails.roblox.com/v1/users/avatar-headshot";

const CACHE_TTL = 180 * 1000; // 3 minutes

/* ---------------- CACHE ---------------- */

let cache: LeaderboardResponse | null = null;
let cacheTime = 0;
let inFlight: Promise<LeaderboardResponse> | null = null;

/* ---------------- TYPES ---------------- */

type Contribution = {
  UserID?: number | string;
  Points?: number | string;
};

type Battle = {
  BattleID?: string;
  StartTime?: number | string;
  FinishTime?: number | string;
  Points?: number | string;
  PointContributions?: Contribution[];
  Title?: string;
  configName?: string;
};

type BattleCandidate = {
  key: string;
  battle: Battle;
};

type LeaderboardEntry = {
  rank: number;
  user_id: number;
  name: string;
  points: number;
  avatar: string | null;
  discord_id: string | null;
  is_alt?: boolean;
};

type LeaderboardResponse = {
  success: boolean;
  title: string;
  total_points: number;
  updatedAt: string;
  data: LeaderboardEntry[];
  active?: boolean;
  error?: string;
};

type WarConfig = {
  StartTime?: number | string;
  FinishTime?: number | string;
  Title?: string;
  configName?: string;
};

/* ---------------- HELPERS ---------------- */

function normalizeTimestamp(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getPoints(entry: Contribution): number {
  return Number(entry.Points ?? 0);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${url}: HTTP ${res.status}`);
  return res.json();
}

/* ---------------- ROBLOX HELPERS ---------------- */

async function getNames(userIds: number[]) {
  const map = new Map<number, string>();

  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);

    try {
      const res = await fetch(ROBLOX_USERS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: chunk,
          excludeBannedUsers: false,
        }),
        cache: "no-store",
      });

      if (!res.ok) continue;

      const data = await res.json();

      for (const u of Array.isArray(data?.data) ? data.data : []) {
        const id = Number(u?.id);
        const name = String(u?.name ?? `Unknown (${id})`);
        if (Number.isFinite(id)) map.set(id, name);
      }
    } catch {
      continue;
    }
  }

  return map;
}

async function getAvatars(userIds: number[]) {
  const map = new Map<number, string>();

  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);

    try {
      const url =
        `${ROBLOX_THUMB_API}` +
        `?userIds=${chunk.join(",")}&size=420x420&format=Png&isCircular=true`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;

      const data = await res.json();

      for (const r of Array.isArray(data?.data) ? data.data : []) {
        const id = Number(r?.targetId);
        const imageUrl = String(r?.imageUrl ?? "");
        if (Number.isFinite(id) && imageUrl) map.set(id, imageUrl);
      }
    } catch {
      continue;
    }
  }

  return map;
}

/* ---------------- BATTLE PICKER ---------------- */

function pickBattle(
  candidates: BattleCandidate[],
  targetName: string,
  now: number
): BattleCandidate | null {
  const target = normalizeKey(targetName);

  const exact = candidates.find(({ key, battle }) => {
    const names = [key, battle?.BattleID, battle?.configName, battle?.Title];
    return names.some((name) => normalizeKey(name) === target);
  });

  if (exact) return exact;

  const activeTimed = candidates.find(({ battle }) => {
    const start = normalizeTimestamp(battle?.StartTime);
    const finish = normalizeTimestamp(battle?.FinishTime);

    if (start > 0 && finish > 0) {
      return start <= now && now <= finish;
    }

    return false;
  });

  if (activeTimed) return activeTimed;

  const withContribs = candidates.find(({ battle }) => {
    return Array.isArray(battle?.PointContributions) && battle.PointContributions.length > 0;
  });

  return withContribs ?? candidates[0] ?? null;
}

/* ---------------- MAIN BUILDER ---------------- */

async function buildLeaderboard(): Promise<LeaderboardResponse> {
  const [war, clan] = await Promise.all([
    fetchJson(ACTIVE_BATTLE_API),
    fetchJson(CLAN_API),
  ]);

  const config: WarConfig = war?.data?.configData ?? {};
  const title = String(config.Title ?? config.configName ?? "MCWV War");

  const now = Math.floor(Date.now() / 1000);
  const start = normalizeTimestamp(config.StartTime);
  const finish = normalizeTimestamp(config.FinishTime);

  const active = start > 0 && finish > 0 ? start <= now && now <= finish : true;

  if (!active) {
    return {
      success: true,
      active: false,
      title,
      total_points: 0,
      updatedAt: new Date().toISOString(),
      data: [],
    };
  }

  const battles = (clan?.data?.Battles ?? {}) as Record<string, Battle>;
  const candidates = Object.entries(battles).map(([key, battle]) => ({
    key,
    battle,
  }));

  const battleEntry = pickBattle(candidates, title, now);
  const battle = battleEntry?.battle ?? null;

  if (!battle) {
    return {
      success: true,
      active: true,
      title,
      total_points: 0,
      updatedAt: new Date().toISOString(),
      data: [],
    };
  }

  const rawContributions: Contribution[] = Array.isArray(battle.PointContributions)
    ? battle.PointContributions
    : [];

  if (!rawContributions.length) {
    return {
      success: true,
      active: true,
      title,
      total_points: Number(battle.Points ?? 0),
      updatedAt: new Date().toISOString(),
      data: [],
    };
  }

  const contributions = rawContributions
    .filter((e): e is Contribution => !!e && typeof e === "object")
    .sort((a, b) => getPoints(b) - getPoints(a));

  const userIds = [
    ...new Set(contributions.map((c) => String(c.UserID)))
  ].filter(Boolean);

  const [nameMap, avatarMap] = await Promise.all([
    getNames(userIds.map(Number).filter(Number.isFinite)),
    getAvatars(userIds.map(Number).filter(Number.isFinite)),
  ]);

  /* ---------------- DISCORD DB FIX ---------------- */

  const usersRes = await pool.query(
    `SELECT roblox_id, discord_id
     FROM users
     WHERE roblox_id = ANY($1)`,
    [userIds]
  );

  const discordMap = new Map(
    usersRes.rows.map((u) => [String(u.roblox_id), u.discord_id])
  );

  /* ---------------- FIXED ALT LOGIC (CORRECT VERSION) ---------------- */

  const discordIds = Array.from(discordMap.values()).filter(Boolean);

  const altRes = await pool.query(
    `SELECT roblox_id
     FROM user_alts
     WHERE discord_id = ANY($1)`,
    [discordIds]
  );

  const altSet = new Set(
    altRes.rows.map((r) => String(r.roblox_id))
  );

  const total_points = Number(battle.Points ?? 0);

  const entries: LeaderboardEntry[] = contributions.map((entry, index) => {
    const user_id = Number(entry.UserID ?? 0);
    const points = getPoints(entry);

    return {
      rank: index + 1,
      user_id,
      name: nameMap.get(user_id) ?? `Unknown (${user_id})`,
      points,
      avatar: avatarMap.get(user_id) ?? null,
      discord_id: discordMap.get(String(user_id)) ?? null,
      is_alt: altSet.has(String(user_id)),
    };
  });

  return {
    success: true,
    active: true,
    title,
    total_points,
    updatedAt: new Date().toISOString(),
    data: entries,
  };
}

/* ---------------- CACHE WRAPPER ---------------- */

async function getCachedLeaderboard(
  forceRefresh = false
): Promise<LeaderboardResponse> {
  const fresh = cache && Date.now() - cacheTime < CACHE_TTL;

  if (!forceRefresh && fresh && cache) {
    return cache;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = buildLeaderboard()
    .then((payload) => {
      cache = payload;
      cacheTime = Date.now();
      return payload;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/* ---------------- ROUTE ---------------- */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const payload = await getCachedLeaderboard(forceRefresh);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        active: false,
        title: "MCWV War",
        total_points: 0,
        updatedAt: new Date().toISOString(),
        data: [],
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
