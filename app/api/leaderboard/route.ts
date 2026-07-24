import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- CONFIG ---------------- */

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";

const ROBLOX_USERS_API = "https://users.roblox.com/v1/users";
const ROBLOX_THUMB_API =
  "https://thumbnails.roblox.com/v1/users/avatar-headshot";

const CACHE_TTL = 180 * 1000; // 3 minutes

/* ---------------- CACHE ---------------- */

let cache: LeaderboardResponse | null = null;
let cacheTime = 0;
let inFlight: Promise<LeaderboardResponse> | null = null;

/* ---------------- POINT HISTORY TRACKING ---------------- */

let lastLoggedBattleKey: string | null = null;
let lastPointsByUser = new Map<number, number>();

function resetPointHistoryTracking() {
  lastLoggedBattleKey = null;
  lastPointsByUser = new Map<number, number>();
}

async function logPointHistory(entries: LeaderboardEntry[], battleKey: string) {
  if (!entries.length) return;

  if (lastLoggedBattleKey !== battleKey) {
    lastLoggedBattleKey = battleKey;
    lastPointsByUser = new Map<number, number>(
      entries.map((entry): [number, number] => [entry.user_id, entry.points ?? 0])
    );
    return;
  }

  const writes: Promise<unknown>[] = [];

  for (const entry of entries) {
    const currentPoints = entry.points ?? 0;
    const previous = lastPointsByUser.get(entry.user_id);

    if (typeof previous === "number") {
      const delta = currentPoints - previous;

      // Only log gains, not decreases.
      if (delta > 0) {
        writes.push(
          pool.query(
            `INSERT INTO point_history (user_id, points_added, created_at)
             VALUES ($1, $2, NOW())`,
            [entry.user_id, delta]
          )
        );
      }
    }

    lastPointsByUser.set(entry.user_id, currentPoints);
  }

  if (writes.length) {
    await Promise.allSettled(writes);
  }
}

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

type ProfileStyle = {
  backgroundUrl: string | null;
  backgroundType: "image" | "gif" | "video" | null;
  backgroundPreset: string;
  accentColor: string;
  framePreset: string;
  bio: string | null;
  badges: string[];
};

type LeaderboardEntry = {
  rank: number;
  user_id: number;
  name: string;
  points: number | null;
  avatar: string | null;
  discord_id: string | null;
  is_alt?: boolean;
  disconnects24h?: number;
  style?: ProfileStyle;
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

const DEFAULT_PROFILE_STYLE: ProfileStyle = {
  backgroundUrl: null,
  backgroundType: null,
  backgroundPreset: "default",
  accentColor: "#34d399",
  framePreset: "none",
  bio: null,
  badges: [],
};

async function ensureProfileStylesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile_styles (
      roblox_id TEXT PRIMARY KEY,
      user_id INTEGER,
      background_url TEXT,
      background_type TEXT,
      background_preset TEXT NOT NULL DEFAULT 'default',
      accent_color TEXT NOT NULL DEFAULT '#34d399',
      frame_preset TEXT NOT NULL DEFAULT 'none',
      bio TEXT,
      badges JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS roblox_id TEXT`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS user_id INTEGER`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS background_url TEXT`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS background_type TEXT`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS background_preset TEXT NOT NULL DEFAULT 'default'`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#34d399'`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS frame_preset TEXT NOT NULL DEFAULT 'none'`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS bio TEXT`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_profile_styles_roblox_id_key ON user_profile_styles (roblox_id)`);
}

type ProfileStyleRow = {
  background_url?: string | null;
  background_type?: string | null;
  background_preset?: string | null;
  accent_color?: string | null;
  frame_preset?: string | null;
  bio?: string | null;
  badges?: unknown;
};

function normalizeProfileStyle(row: ProfileStyleRow | null | undefined): ProfileStyle {
  if (!row) return DEFAULT_PROFILE_STYLE;

  const badges = Array.isArray(row.badges)
    ? row.badges.map(String).slice(0, 8)
    : [];

  const backgroundType = ["image", "gif", "video"].includes(String(row.background_type ?? ""))
    ? (String(row.background_type) as "image" | "gif" | "video")
    : null;

  return {
    backgroundUrl: row.background_url ?? null,
    backgroundType,
    backgroundPreset: String(row.background_preset ?? "default"),
    accentColor: String(row.accent_color ?? "#34d399"),
    framePreset: String(row.frame_preset ?? "none"),
    bio: row.bio ?? null,
    badges,
  };
}

async function attachProfileStyles(entries: LeaderboardEntry[]) {
  if (!entries.length) return entries;

  try {
    await ensureProfileStylesTable();
    const ids = entries.map((entry) => String(entry.user_id));
    const result = await pool.query(
      `SELECT roblox_id,
              background_url,
              background_type,
              background_preset,
              accent_color,
              frame_preset,
              bio,
              badges
       FROM user_profile_styles
       WHERE roblox_id = ANY($1)`,
      [ids]
    );

    const styles = new Map(
      result.rows.map((row) => [String(row.roblox_id), normalizeProfileStyle(row)])
    );

    return entries.map((entry) => ({
      ...entry,
      disconnects24h: entry.disconnects24h ?? 0,
      style: styles.get(String(entry.user_id)) ?? DEFAULT_PROFILE_STYLE,
    }));
  } catch (err) {
    console.error("[leaderboard/styles] attach error:", err);
    return entries.map((entry) => ({
      ...entry,
      disconnects24h: entry.disconnects24h ?? 0,
      style: DEFAULT_PROFILE_STYLE,
    }));
  }
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

/* ---------------- HISTORICAL LEADERBOARD (from DB) ---------------- */

async function buildHistoricalLeaderboard(battleId: string): Promise<LeaderboardResponse> {
  // Get battle info
  const battleRes = await pool.query(
    `SELECT battle_id, battle_name, start_time, end_time
     FROM battles
     WHERE battle_id = $1
     LIMIT 1`,
    [battleId]
  );

  if (!battleRes.rows[0]) {
    return {
      success: true,
      active: false,
      title: "Historical War",
      total_points: 0,
      updatedAt: new Date().toISOString(),
      data: [],
    };
  }

  const battle = battleRes.rows[0];
  const title = battle.battle_name || battle.battle_id || "Historical War";

  // Get MCWV's clan snapshot for this battle
  const snapshotRes = await pool.query(
    `SELECT rank, battle_points, captured_at
     FROM war_snapshots
     WHERE battle_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [battleId]
  );

  // Get individual member contributions from battle_user_contributions
  const membersRes = await pool.query(
    `SELECT buc.user_id, buc.username, buc.points, buc.captured_at,
            u.roblox_id, u.discord_id
     FROM battle_user_contributions buc
     LEFT JOIN users u ON u.roblox_id = buc.user_id
     WHERE buc.battle_id = $1
     ORDER BY buc.points DESC, buc.captured_at DESC`,
    [battleId]
  );

  // Get Roblox names and avatars for members
  const robloxIds = membersRes.rows
    .map((r) => Number(r.roblox_id))
    .filter((id) => Number.isFinite(id));

  const [nameMap, avatarMap] = await Promise.all([
    getNames(robloxIds),
    getAvatars(robloxIds),
  ]);

  // Get alt mappings
  const discordIds = membersRes.rows
    .map((r) => r.discord_id)
    .filter(Boolean);

  const altRes = await pool.query(
    `SELECT roblox_id FROM user_alts WHERE discord_id = ANY($1)`,
    [discordIds]
  );

  const altSet = new Set(altRes.rows.map((r) => String(r.roblox_id)));

  // Build leaderboard entries from member data
  const entries: LeaderboardEntry[] = membersRes.rows.map((row, index) => {
    const user_id = Number(row.user_id);
    const points = Number(row.points || 0);
    const robloxId = Number(row.roblox_id);
    const discordId = row.discord_id;

    return {
      rank: index + 1,
      user_id,
      name: row.username || nameMap.get(robloxId) || `Unknown (${user_id})`,
      points,
      avatar: avatarMap.get(robloxId) ?? null,
      discord_id: discordId ?? null,
      is_alt: altSet.has(String(user_id)),
    };
  });

  return {
    success: true,
    active: false,
    title: `${title} - MCWV Members`,
    total_points: Number(snapshotRes.rows[0]?.battle_points ?? 0),
    updatedAt: new Date().toISOString(),
    data: await attachProfileStyles(entries),
  };
}

/* ---------------- INACTIVE ROSTER FALLBACK ---------------- */

async function buildInactiveRoster(title = "MCWV Roster"): Promise<LeaderboardResponse> {
  const rows: Array<{
    roblox_id: string;
    username: string | null;
    discord_id: string | null;
    is_alt: boolean;
  }> = [];

  const mainRes = await pool.query(
    `SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id,
            username::text AS username,
            discord_id::text AS discord_id,
            false AS is_alt
     FROM users
     WHERE roblox_id IS NOT NULL
       AND TRIM(CAST(roblox_id AS TEXT)) <> ''`
  );

  rows.push(...mainRes.rows);

  const altTable = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.user_alts') IS NOT NULL AS exists`
  );

  if (altTable.rows[0]?.exists) {
    const altRes = await pool.query(
      `SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id,
              username::text AS username,
              discord_id::text AS discord_id,
              true AS is_alt
       FROM user_alts
       WHERE roblox_id IS NOT NULL
         AND TRIM(CAST(roblox_id AS TEXT)) <> ''`
    );

    rows.push(...altRes.rows);
  }

  const deduped = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!row.roblox_id) continue;
    const existing = deduped.get(row.roblox_id);
    if (!existing || (existing.is_alt && !row.is_alt)) {
      deduped.set(row.roblox_id, row);
    }
  }

  const rosterRows = Array.from(deduped.values()).sort((a, b) =>
    String(a.username ?? a.roblox_id).localeCompare(String(b.username ?? b.roblox_id))
  );

  const robloxIds = rosterRows.map((row) => Number(row.roblox_id)).filter(Number.isFinite);
  const [nameMap, avatarMap] = await Promise.all([
    getNames(robloxIds),
    getAvatars(robloxIds),
  ]);

  const entries: LeaderboardEntry[] = rosterRows.map((row, index) => {
    const user_id = Number(row.roblox_id);

    return {
      rank: index + 1,
      user_id,
      name: row.username || nameMap.get(user_id) || `Unknown (${row.roblox_id})`,
      points: null,
      avatar: avatarMap.get(user_id) ?? null,
      discord_id: row.discord_id ?? null,
      is_alt: row.is_alt,
      disconnects24h: 0,
    };
  });

  return {
    success: true,
    active: false,
    title: `${title} - No Active War`,
    total_points: 0,
    updatedAt: new Date().toISOString(),
    data: await attachProfileStyles(entries),
  };
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
    resetPointHistoryTracking();
    return buildInactiveRoster(title);
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

  /* ---------------- POINT HISTORY LOGGING ---------------- */
  const battleKey = normalizeKey(
    battleEntry?.key ?? battle?.BattleID ?? battle?.configName ?? title
  );

  await logPointHistory(entries, battleKey);

  return {
    success: true,
    active: true,
    title,
    total_points,
    updatedAt: new Date().toISOString(),
    data: await attachProfileStyles(entries),
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
    const battleId = url.searchParams.get("battle_id");

    // If battle_id is provided, return historical leaderboard
    if (battleId) {
      const payload = await buildHistoricalLeaderboard(battleId);
      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Otherwise, return current leaderboard
    const payload = await getCachedLeaderboard(forceRefresh);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[leaderboard] error:", err);
    return NextResponse.json(
      {
        success: false,
        active: false,
        title: "MCWV War",
        total_points: 0,
        updatedAt: new Date().toISOString(),
        data: [],
        error: "Failed to load leaderboard data",
      },
      { status: 500 }
    );
  }
}
