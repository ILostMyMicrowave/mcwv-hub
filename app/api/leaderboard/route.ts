import { NextResponse, after } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
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
  lastPointsByUser = new Map();
}

async function logPointHistory(entries: LeaderboardEntry[], battleKey: string) {
  if (!entries.length) return;

  if (lastLoggedBattleKey !== battleKey) {
    lastLoggedBattleKey = battleKey;
    lastPointsByUser = new Map(
      entries
        .filter((entry) => typeof entry.points === "number")
        .map((entry) => [entry.user_id, entry.points as number])
    );
    return;
  }

  const writes: Promise<unknown>[] = [];

  for (const entry of entries) {
    const previous = lastPointsByUser.get(entry.user_id);

    if (typeof previous === "number") {
      if (typeof entry.points !== "number") continue;

      const delta = entry.points - previous;

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

    if (typeof entry.points === "number") {
      lastPointsByUser.set(entry.user_id, entry.points);
    }
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
  framePrimaryColor?: string | null;
  frameSecondaryColor?: string | null;
  frameEmoji?: string | null;
  fontPreset?: string | null;
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
  /** true when the player was snapshotted this war but has since left/been
   * kicked from the clan — kept on the board with their last known points. */
  departed?: boolean;
  disconnects24h?: number;
  change5m?: number;
  pph?: number;
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

function formatBattleTitle(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Historical War";

  const withSpaces = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d{4})$/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withSpaces || raw;
}

function isGenericBattleName(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || normalized === "mcwv war" || normalized === "historical war" || normalized === "war";
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
  framePrimaryColor: "#34d399",
  frameSecondaryColor: "#38bdf8",
  frameEmoji: "",
  fontPreset: "default",
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
      frame_primary_color TEXT NOT NULL DEFAULT '#34d399',
      frame_secondary_color TEXT NOT NULL DEFAULT '#38bdf8',
      frame_emoji TEXT NOT NULL DEFAULT '',
      font_preset TEXT NOT NULL DEFAULT 'default',
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
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS frame_primary_color TEXT NOT NULL DEFAULT '#34d399'`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS frame_secondary_color TEXT NOT NULL DEFAULT '#38bdf8'`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS frame_emoji TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS font_preset TEXT NOT NULL DEFAULT 'default'`);
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
  frame_primary_color?: string | null;
  frame_secondary_color?: string | null;
  frame_emoji?: string | null;
  font_preset?: string | null;
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
    framePrimaryColor: String(row.frame_primary_color ?? "#34d399"),
    frameSecondaryColor: String(row.frame_secondary_color ?? "#38bdf8"),
    frameEmoji: String(row.frame_emoji ?? ""),
    fontPreset: String(row.font_preset ?? "default"),
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
              frame_primary_color,
              frame_secondary_color,
              frame_emoji,
              font_preset,
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


/* ---------------- LEADERBOARD SNAPSHOT HISTORY ---------------- */

type BaselineRow = {
  roblox_id: string;
  points: number | string;
  captured_at: Date | string;
};

type PointBaseline = {
  points: number;
  capturedAt: Date;
};

type LatestSnapshotRow = {
  captured_at: Date | string | null;
};

async function ensureLeaderboardHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_leaderboard_history (
      id BIGSERIAL PRIMARY KEY,
      battle_id TEXT,
      roblox_id TEXT NOT NULL,
      username TEXT,
      rank INTEGER,
      points BIGINT,
      pph NUMERIC,
      change_5m BIGINT,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS battle_id TEXT`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS roblox_id TEXT`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS username TEXT`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS rank INTEGER`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS points BIGINT`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS pph NUMERIC`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS change_5m BIGINT`);
  await pool.query(`ALTER TABLE player_leaderboard_history ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS player_leaderboard_history_roblox_time_idx ON player_leaderboard_history (roblox_id, captured_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS player_leaderboard_history_battle_idx ON player_leaderboard_history (battle_id)`);
}

function mapBaselineRows(rows: BaselineRow[]) {
  return new Map<string, PointBaseline>(
    rows.map((row) => [
      String(row.roblox_id),
      {
        points: Number(row.points ?? 0),
        capturedAt: new Date(row.captured_at),
      },
    ])
  );
}

async function getPointBaselines(ids: string[], intervalSql: "5 minutes" | "1 hour", battleKey: string) {
  if (!ids.length) return new Map<string, PointBaseline>();

  const result = await pool.query<BaselineRow>(
    `SELECT DISTINCT ON (roblox_id) roblox_id, points, captured_at
     FROM player_leaderboard_history
     WHERE roblox_id = ANY($1)
       AND battle_id = $3
       AND points IS NOT NULL
       AND captured_at <= NOW() - ($2::interval)
     ORDER BY roblox_id, captured_at DESC`,
    [ids, intervalSql, battleKey]
  );

  return mapBaselineRows(result.rows);
}

async function getEarliestRecentBaselines(ids: string[], intervalSql: "1 hour", battleKey: string) {
  if (!ids.length) return new Map<string, PointBaseline>();

  const result = await pool.query<BaselineRow>(
    `SELECT DISTINCT ON (roblox_id) roblox_id, points, captured_at
     FROM player_leaderboard_history
     WHERE roblox_id = ANY($1)
       AND battle_id = $3
       AND points IS NOT NULL
       AND captured_at >= NOW() - ($2::interval)
     ORDER BY roblox_id, captured_at ASC`,
    [ids, intervalSql, battleKey]
  );

  return mapBaselineRows(result.rows);
}

function pointsGainedSince(currentPoints: number, baseline: PointBaseline | undefined) {
  if (!baseline) return 0;
  return Math.max(0, currentPoints - baseline.points);
}

type PlayerHistoryPoint = {
  points: number;
  capturedAt: Date;
};

async function getRecentPlayerHistory(ids: string[], battleKey: string) {
  const history = new Map<string, PlayerHistoryPoint[]>();
  if (!ids.length) return history;

  const result = await pool.query<BaselineRow>(
    `SELECT roblox_id, points, captured_at
     FROM player_leaderboard_history
     WHERE roblox_id = ANY($1)
       AND battle_id = $2
       AND points IS NOT NULL
       AND captured_at >= NOW() - INTERVAL '2 hours'
     ORDER BY roblox_id ASC, captured_at ASC`,
    [ids, battleKey]
  );

  for (const row of result.rows) {
    const key = String(row.roblox_id);
    const list = history.get(key) ?? [];
    list.push({
      points: Number(row.points ?? 0),
      capturedAt: new Date(row.captured_at),
    });
    history.set(key, list);
  }

  return history;
}

function pointsAtExactTime(history: PlayerHistoryPoint[], targetMs: number) {
  const sorted = [...history]
    .filter((row) => Number.isFinite(row.capturedAt.getTime()) && Number.isFinite(row.points))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  if (!sorted.length) return null;
  if (targetMs < sorted[0].capturedAt.getTime()) return null;

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const currentMs = current.capturedAt.getTime();

    if (currentMs === targetMs) return current.points;

    const next = sorted[index + 1];
    if (!next) return current.points;

    const nextMs = next.capturedAt.getTime();
    if (currentMs <= targetMs && targetMs <= nextMs) {
      const span = nextMs - currentMs;
      if (span <= 0) return current.points;
      const ratio = (targetMs - currentMs) / span;
      return current.points + (next.points - current.points) * ratio;
    }
  }

  return sorted[sorted.length - 1].points;
}

async function attachDisconnectCounts(entries: LeaderboardEntry[]) {
  if (!entries.length) return entries;

  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.player_presence_events') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) return entries.map((entry) => ({ ...entry, disconnects24h: entry.disconnects24h ?? 0 }));

    const ids = entries.map((entry) => String(entry.user_id));
    const result = await pool.query<{ roblox_id: string; count: string }>(
      `SELECT roblox_id::text AS roblox_id, COUNT(*)::text AS count
       FROM player_presence_events
       WHERE roblox_id::text = ANY($1)
         AND created_at >= NOW() - INTERVAL '24 hours'
         AND LOWER(COALESCE(previous_status::text, '')) IN ('in_game', 'ingame', '2')
         AND LOWER(COALESCE(next_status::text, '')) IN ('offline', 'online', '0', '1')
       GROUP BY roblox_id::text`,
      [ids]
    );

    const counts = new Map(result.rows.map((row) => [String(row.roblox_id), Number(row.count ?? 0)]));
    return entries.map((entry) => ({
      ...entry,
      disconnects24h: counts.get(String(entry.user_id)) ?? entry.disconnects24h ?? 0,
    }));
  } catch (err) {
    console.error("[leaderboard/disconnects] attach error:", err);
    return entries.map((entry) => ({ ...entry, disconnects24h: entry.disconnects24h ?? 0 }));
  }
}

async function attachLiveMetricsAndSnapshot(entries: LeaderboardEntry[], battleKey: string) {
  const activeEntries = entries.filter((entry) => typeof entry.points === "number");
  if (!activeEntries.length) return entries;

  try {
    await ensureLeaderboardHistoryTable();

    const ids = activeEntries.map((entry) => String(entry.user_id));
    const historyById = await getRecentPlayerHistory(ids, battleKey);
    const now = new Date();
    const nowMs = now.getTime();
    const fiveMinuteCutoff = nowMs - 5 * 60 * 1000;
    const hourlyCutoff = nowMs - 60 * 60 * 1000;

    const enriched = entries.map((entry) => {
      if (typeof entry.points !== "number") return entry;
      const key = String(entry.user_id);
      const history = [
        ...(historyById.get(key) ?? []),
        { points: entry.points, capturedAt: now },
      ];

      const fiveMinuteBaseline = pointsAtExactTime(history, fiveMinuteCutoff);
      const hourlyBaseline = pointsAtExactTime(history, hourlyCutoff);

      return {
        ...entry,
        change5m: fiveMinuteBaseline === null ? 0 : Math.max(0, Math.round(entry.points - fiveMinuteBaseline)),
        pph: hourlyBaseline === null ? 0 : Math.max(0, Math.round(entry.points - hourlyBaseline)),
      };
    });

    const latest = await pool.query<LatestSnapshotRow>(
      `SELECT MAX(captured_at) AS captured_at
       FROM player_leaderboard_history
       WHERE battle_id = $1`,
      [battleKey]
    );
    const lastSnapshotAt = latest.rows[0]?.captured_at ? new Date(latest.rows[0].captured_at).getTime() : 0;
    const shouldWriteSnapshot = !lastSnapshotAt || Date.now() - lastSnapshotAt >= 60 * 1000;

    if (shouldWriteSnapshot) {
      const snapshotRows = enriched.filter((entry) => typeof entry.points === "number");
      if (snapshotRows.length) {
        await pool.query(
          `INSERT INTO player_leaderboard_history
             (battle_id, roblox_id, username, rank, points, pph, change_5m, captured_at)
           SELECT $1, item.roblox_id, item.username, item.rank, item.points, item.pph, item.change_5m, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS item(
             roblox_id TEXT,
             username TEXT,
             rank INTEGER,
             points BIGINT,
             pph NUMERIC,
             change_5m BIGINT
           )`,
          [
            battleKey,
            JSON.stringify(snapshotRows.map((entry) => ({
              roblox_id: String(entry.user_id),
              username: entry.name,
              rank: entry.rank,
              points: entry.points,
              pph: entry.pph ?? 0,
              change_5m: entry.change5m ?? 0,
            }))),
          ]
        );
      }
    }

    return enriched;
  } catch (err) {
    console.error("[leaderboard/history] snapshot error:", err);
    return entries.map((entry) => ({ ...entry, change5m: entry.change5m ?? 0, pph: entry.pph ?? 0 }));
  }
}

/* ---------------- CURRENT ROSTER HELPER ---------------- */

/** Current in-game roster (Members + Owner) from a clan API payload. */
function extractCurrentRosterIds(clanPayload: unknown): Set<string> {
  const ids = new Set<string>();
  const data = (clanPayload as Record<string, unknown> | null)?.data as
    | Record<string, unknown>
    | undefined;
  if (!data) return ids;

  const owner = data.Owner ?? data.owner;
  if (owner !== null && owner !== undefined && String(owner).trim()) {
    ids.add(String(owner).trim());
  }

  const members = Array.isArray(data.Members) ? data.Members : [];
  for (const member of members) {
    const record = member as Record<string, unknown> | null;
    const id = record?.UserID ?? record?.userId ?? record?.id;
    if (id !== null && id !== undefined && String(id).trim()) {
      ids.add(String(id).trim());
    }
  }

  return ids;
}

type HistoryExtraRow = {
  roblox_id: string;
  username: string | null;
  points: number | string | null;
};

/** Big Games rewrites a battle's PointContributions when players leave the
 * clan afterwards — kicked/departed contributors vanish from the ledger.
 * Restore them from our own hourly snapshots: anyone seen with points > 0
 * during the war's final 24 hours was part of that war's leaderboard.
 * Zero-point players are never restored — history wars are scorers only.
 */
async function appendMissingScoredMembers(
  entries: LeaderboardEntry[],
  battleKeys: string[]
): Promise<LeaderboardEntry[]> {
  const keys = [...new Set(battleKeys.map(normalizeKey).filter(Boolean))];
  if (!keys.length) return entries;

  try {
    const tableCheck = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.player_leaderboard_history') IS NOT NULL AS exists`
    );
    if (!tableCheck.rows[0]?.exists) return entries;

    const knownIds = new Set(entries.map((entry) => String(entry.user_id)));

    const historyRes = await pool.query<HistoryExtraRow>(
      `WITH latest AS (
         SELECT MAX(captured_at) AS ts
         FROM player_leaderboard_history
         WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = ANY($1)
       )
       SELECT DISTINCT ON (player_leaderboard_history.roblox_id)
         roblox_id::text AS roblox_id,
         username,
         points
       FROM player_leaderboard_history
       CROSS JOIN latest
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = ANY($1)
         AND points IS NOT NULL
         AND captured_at >= latest.ts - INTERVAL '24 hours'
       ORDER BY player_leaderboard_history.roblox_id, captured_at DESC`,
      [keys]
    );

    const missingRows = historyRes.rows.filter(
      (row) => !knownIds.has(String(row.roblox_id)) && Number(row.points ?? 0) > 0
    );
    if (!missingRows.length) return entries;

    const missingIds = missingRows.map((row) => String(row.roblox_id).trim());
    const missingNumericIds = missingIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));

    const [extraNames, extraAvatars, extraUsersRes] = await Promise.all([
      getNames(missingNumericIds),
      getAvatars(missingNumericIds),
      pool.query<{ roblox_id: string; discord_id: string | number | null }>(
        `SELECT roblox_id::text AS roblox_id, discord_id
         FROM users
         WHERE roblox_id::text = ANY($1)`,
        [missingIds]
      ),
    ]);

    const extraDiscordMap = new Map(
      extraUsersRes.rows.map((row) => [String(row.roblox_id), row.discord_id])
    );
    const extraDiscordIds = Array.from(extraDiscordMap.values()).filter(Boolean);

    let extraAltSet = new Set<string>();
    if (extraDiscordIds.length) {
      const extraAltRes = await pool.query<{ roblox_id: string | number }>(
        `SELECT roblox_id FROM user_alts WHERE discord_id = ANY($1)`,
        [extraDiscordIds]
      );
      extraAltSet = new Set(extraAltRes.rows.map((row) => String(row.roblox_id)));
    }

    const extraEntries: LeaderboardEntry[] = missingRows.map((row) => {
      const userId = Number(row.roblox_id);
      const discordId = extraDiscordMap.get(String(row.roblox_id));
      return {
        rank: 0, // re-ranked below
        user_id: userId,
        name: row.username || extraNames.get(userId) || `Unknown (${userId})`,
        points: Number(row.points ?? 0),
        avatar: extraAvatars.get(userId) ?? null,
        discord_id: discordId === null || discordId === undefined ? null : String(discordId),
        is_alt: extraAltSet.has(String(row.roblox_id)),
      };
    });

    return [...entries, ...extraEntries]
      .sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  } catch (err) {
    console.error("[leaderboard/roster-zeros] merge error:", err);
    return entries;
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


/* ---------------- HISTORICAL LEADERBOARD FALLBACK (from clan API) ---------------- */

async function buildHistoricalFromClanApi(battleId: string, fallbackTitle = "Historical War"): Promise<LeaderboardResponse> {
  try {
    const clan = await fetchJson(CLAN_API);
    const battles = (clan?.data?.Battles ?? {}) as Record<string, Battle>;
    const candidates = Object.entries(battles).map(([key, battle]) => ({ key, battle }));
    const normalizedTarget = normalizeKey(battleId);
    const match = candidates.find(({ key, battle }) => {
      const names = [key, battle?.BattleID, battle?.configName, battle?.Title];
      return names.some((name) => normalizeKey(name) === normalizedTarget);
    });

    const battle = match?.battle ?? null;
    const rawContributions: Contribution[] = Array.isArray(battle?.PointContributions)
      ? battle.PointContributions
      : [];

    if (!battle || !rawContributions.length) {
      return {
        success: true,
        active: false,
        title: fallbackTitle,
        total_points: 0,
        updatedAt: new Date().toISOString(),
        data: [],
      };
    }

    const contributions = rawContributions
      .filter((entry): entry is Contribution => !!entry && typeof entry === "object")
      .sort((a, b) => getPoints(b) - getPoints(a));

    const userIds = [
      ...new Set(contributions.map((entry) => Number(entry.UserID ?? 0)).filter(Number.isFinite)),
    ];

    const [nameMap, avatarMap] = await Promise.all([
      getNames(userIds),
      getAvatars(userIds),
    ]);

    const usersRes = await pool.query(
      `SELECT roblox_id, discord_id
       FROM users
       WHERE roblox_id::text = ANY($1)`,
      [userIds.map(String)]
    );

    const discordMap = new Map(
      usersRes.rows.map((row) => [String(row.roblox_id), row.discord_id])
    );

    const discordIds = Array.from(discordMap.values()).filter(Boolean);
    let altSet = new Set<string>();

    if (discordIds.length) {
      const altRes = await pool.query(
        `SELECT roblox_id
         FROM user_alts
         WHERE discord_id = ANY($1)`,
        [discordIds]
      );
      altSet = new Set(altRes.rows.map((row) => String(row.roblox_id)));
    }

    let entries: LeaderboardEntry[] = contributions.map((entry, index) => {
      const user_id = Number(entry.UserID ?? 0);
      return {
        rank: index + 1,
        user_id,
        name: nameMap.get(user_id) ?? `Unknown (${user_id})`,
        points: getPoints(entry),
        avatar: avatarMap.get(user_id) ?? null,
        discord_id: discordMap.get(String(user_id)) ?? null,
        is_alt: altSet.has(String(user_id)),
      };
    });

    // Historical wars = everyone who had POINTS in that war: the
    // PointContributions ledger (members still in the clan) + contributors
    // Big Games dropped because they were kicked/left after the war
    // (restored from our snapshots). No zero-point players. This yields the
    // war's true final leaderboard — e.g. 75 for Gummy, not 68.
    entries = await appendMissingScoredMembers(entries, [
      match?.key ?? "",
      battle?.BattleID ?? "",
      battle?.configName ?? "",
      battle?.Title ?? "",
      battleId,
    ]);

    const currentRosterIds = extractCurrentRosterIds(clan);

    // Mark anyone who competed but is no longer in the clan today, so the
    // UI can show a "left clan" marker.
    if (currentRosterIds.size) {
      entries = entries.map((entry) => ({
        ...entry,
        departed: !currentRosterIds.has(String(entry.user_id)),
      }));
    }

    const title = formatBattleTitle(battle.Title ?? battle.configName ?? battle.BattleID ?? fallbackTitle);

    return {
      success: true,
      active: false,
      title: `${title} - Historical War`,
      total_points: Number(battle.Points ?? entries.reduce((sum, entry) => sum + Number(entry.points ?? 0), 0)),
      updatedAt: new Date().toISOString(),
      data: await attachProfileStyles(entries),
    };
  } catch (err) {
    console.error("[leaderboard/history] clan API fallback error:", err);
    return {
      success: true,
      active: false,
      title: fallbackTitle,
      total_points: 0,
      updatedAt: new Date().toISOString(),
      data: [],
    };
  }
}

/* ---------------- HISTORICAL LEADERBOARD (from DB) ---------------- */

async function buildHistoricalLeaderboard(battleId: string): Promise<LeaderboardResponse> {
  const battleKey = normalizeKey(battleId);

  // Get battle info. Match both exact and normalised IDs because older rows may
  // have different casing/spacing between battles, snapshots, and player history.
  const battleRes = await pool.query(
    `SELECT battle_id, battle_name, start_time, end_time
     FROM battles
     WHERE battle_id = $1
        OR regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $2
        OR regexp_replace(lower(COALESCE(battle_name, '')), '[^a-z0-9]+', '', 'g') = $2
     ORDER BY end_time DESC NULLS LAST, start_time DESC NULLS LAST
     LIMIT 1`,
    [battleId, battleKey]
  );

  const battle = battleRes.rows[0];
  const canonicalBattleId = String(battle?.battle_id ?? battleId);
  const canonicalBattleKey = normalizeKey(canonicalBattleId);
  const titleSource = battle ? (isGenericBattleName(battle.battle_name) ? battle.battle_id : battle.battle_name) : battleId;
  const title = formatBattleTitle(titleSource || canonicalBattleId || "Historical War");

  // For historical battles, the PS99 clan battle contribution list is the source
  // of truth for who was actually in/contributed to the clan battle at that time.
  // Prefer it when available so newer members added after the war do not appear.
  const apiHistorical = await buildHistoricalFromClanApi(canonicalBattleId, title);
  if (apiHistorical.data.length > 0) {
    return apiHistorical;
  }

  // Get MCWV's latest clan snapshot for this battle.
  const snapshotRes = await pool.query(
    `SELECT rank, battle_points, captured_at
     FROM war_snapshots
     WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [canonicalBattleKey]
  );

  // Preferred source: player_leaderboard_history. This is what current data
  // collection actually writes. battle_user_contributions is older/optional and
  // may be empty, which caused blank historical leaderboards for Gummy.
  let membersRows: Array<{
    user_id: string | number;
    username: string | null;
    points: string | number | null;
    captured_at: Date | string | null;
    roblox_id: string | number | null;
    discord_id: string | number | null;
  }> = [];

  const historyExists = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.player_leaderboard_history') IS NOT NULL AS exists`
  );

  if (historyExists.rows[0]?.exists) {
    const historyRes = await pool.query(
      `SELECT DISTINCT ON (h.roblox_id)
          h.roblox_id::text AS user_id,
          h.username,
          h.points,
          h.captured_at,
          u.roblox_id,
          u.discord_id
       FROM player_leaderboard_history h
       LEFT JOIN users u ON TRIM(CAST(u.roblox_id AS TEXT)) = TRIM(CAST(h.roblox_id AS TEXT))
       WHERE regexp_replace(lower(h.battle_id), '[^a-z0-9]+', '', 'g') = $1
         AND h.points IS NOT NULL
       ORDER BY h.roblox_id, h.captured_at DESC`,
      [canonicalBattleKey]
    );
    membersRows = historyRes.rows;
  }

  // Fallback for any future/imported reports that use battle_user_contributions.
  if (!membersRows.length) {
    try {
      const bucExists = await pool.query<{ exists: boolean }>(
        `SELECT to_regclass('public.battle_user_contributions') IS NOT NULL AS exists`
      );

      if (bucExists.rows[0]?.exists) {
        const membersRes = await pool.query(
          `SELECT buc.user_id, buc.username, buc.points, buc.captured_at,
                  u.roblox_id, u.discord_id
           FROM battle_user_contributions buc
           LEFT JOIN users u ON TRIM(CAST(u.roblox_id AS TEXT)) = TRIM(CAST(buc.user_id AS TEXT))
           WHERE regexp_replace(lower(buc.battle_id), '[^a-z0-9]+', '', 'g') = $1
           ORDER BY buc.points DESC, buc.captured_at DESC`,
          [canonicalBattleKey]
        );
        membersRows = membersRes.rows;
      }
    } catch (err) {
      console.warn("[leaderboard/history] battle_user_contributions fallback failed:", err);
    }
  }

  if (!membersRows.length) {
    return buildHistoricalFromClanApi(canonicalBattleId, title);
  }

  // Sort by final/latest points before ranking.
  membersRows = [...membersRows].sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0));

  const robloxIds = membersRows
    .map((r) => Number(r.user_id))
    .filter((id) => Number.isFinite(id));

  const [nameMap, avatarMap] = await Promise.all([
    getNames(robloxIds),
    getAvatars(robloxIds),
  ]);

  const discordIds = membersRows
    .map((r) => r.discord_id)
    .filter(Boolean);

  let altSet = new Set<string>();
  if (discordIds.length) {
    try {
      const altTable = await pool.query<{ exists: boolean }>(
        `SELECT to_regclass('public.user_alts') IS NOT NULL AS exists`
      );
      if (altTable.rows[0]?.exists) {
        const altRes = await pool.query(
          `SELECT roblox_id FROM user_alts WHERE discord_id = ANY($1)`,
          [discordIds]
        );
        altSet = new Set(altRes.rows.map((r) => String(r.roblox_id)));
      }
    } catch {
      altSet = new Set<string>();
    }
  }

  const entries: LeaderboardEntry[] = membersRows.map((row, index) => {
    const user_id = Number(row.user_id);
    const points = Number(row.points || 0);
    const discordId = row.discord_id;

    return {
      rank: index + 1,
      user_id,
      name: row.username || nameMap.get(user_id) || `Unknown (${user_id})`,
      points,
      avatar: avatarMap.get(user_id) ?? null,
      discord_id: discordId === null || discordId === undefined ? null : String(discordId),
      is_alt: altSet.has(String(user_id)),
    };
  });

  if (!entries.length) {
    return buildHistoricalFromClanApi(canonicalBattleId, title);
  }

  return {
    success: true,
    active: false,
    title: `${title} - Historical War`,
    total_points: Number(snapshotRes.rows[0]?.battle_points ?? entries.reduce((sum, entry) => sum + Number(entry.points ?? 0), 0)),
    updatedAt: new Date().toISOString(),
    data: await attachProfileStyles(entries),
  };
}

/* ---------------- INACTIVE ROSTER FALLBACK ---------------- */

async function buildInactiveRoster(title = "MCWV Roster"): Promise<LeaderboardResponse> {
  // No active war: show the CURRENT in-game roster (Members + Owner) — clan
  // members who never linked a hub account still appear, and linked accounts
  // no longer in the clan do not. Falls back to tracked hub accounts if the
  // clan API can't be read.
  try {
    const clan = await fetchJson(CLAN_API);
    const rosterIds = [...extractCurrentRosterIds(clan)];

    if (rosterIds.length) {
      const rosterNumericIds = rosterIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
      const [rosterNames, rosterAvatars] = await Promise.all([
        getNames(rosterNumericIds),
        getAvatars(rosterNumericIds),
      ]);

      const rosterUsersRes = await pool.query(
        `SELECT roblox_id, discord_id
         FROM users
         WHERE roblox_id = ANY($1)`,
        [rosterIds]
      );
      const rosterDiscordMap = new Map(
        rosterUsersRes.rows.map((u) => [String(u.roblox_id), u.discord_id])
      );

      const rosterDiscordIds = Array.from(rosterDiscordMap.values()).filter(Boolean);
      let rosterAltSet = new Set<string>();
      if (rosterDiscordIds.length) {
        const rosterAltRes = await pool.query(
          `SELECT roblox_id
           FROM user_alts
           WHERE discord_id = ANY($1)`,
          [rosterDiscordIds]
        );
        rosterAltSet = new Set(rosterAltRes.rows.map((r) => String(r.roblox_id)));
      }

      const rosterEntries: LeaderboardEntry[] = rosterIds
        .map((id) => {
          const userId = Number(id);
          const discordId = rosterDiscordMap.get(id);
          return {
            rank: 0, // re-ranked after sorting by name
            user_id: userId,
            name: rosterNames.get(userId) ?? `Unknown (${userId})`,
            points: null,
            avatar: rosterAvatars.get(userId) ?? null,
            discord_id: discordId === null || discordId === undefined ? null : String(discordId),
            is_alt: rosterAltSet.has(id),
            disconnects24h: 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return {
        success: true,
        active: false,
        title: "No Active War",
        total_points: 0,
        updatedAt: new Date().toISOString(),
        data: await attachProfileStyles(rosterEntries),
      };
    }
  } catch (err) {
    console.error("[leaderboard/roster] clan API roster read failed, using tracked accounts:", err);
  }

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
       AND TRIM(CAST(roblox_id AS TEXT)) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM mcwv_loa_records l
         WHERE l.active = TRUE
           AND l.roblox_id = TRIM(CAST(users.roblox_id AS TEXT))
       )`
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
         AND TRIM(CAST(roblox_id AS TEXT)) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM mcwv_loa_records l
           WHERE l.active = TRUE
             AND l.roblox_id = TRIM(CAST(user_alts.roblox_id AS TEXT))
         )`
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
    title: "No Active War",
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
    // No war running — just show the tracked roster.
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

  // Note: no early return when contributions are empty — a brand-new war
  // should still show the current roster with 0 points.
  const rawContributions: Contribution[] = Array.isArray(battle.PointContributions)
    ? battle.PointContributions
    : [];

  const contributions = rawContributions
    .filter((e): e is Contribution => !!e && typeof e === "object")
    .sort((a, b) => getPoints(b) - getPoints(a));

  const contributionPoints = new Map<string, number>();
  for (const c of contributions) {
    const id = String(c.UserID ?? "").trim();
    if (id) contributionPoints.set(id, getPoints(c));
  }

  // The live board shows the CURRENT in-game roster (Members + Owner): clan
  // members who never linked a hub account still appear, linked accounts no
  // longer in the clan do not, and kicked members drop out immediately.
  // Falls back to the contribution list if the roster can't be read.
  const liveRosterIds = extractCurrentRosterIds(clan);
  const userIds = [
    ...new Set(liveRosterIds.size ? [...liveRosterIds] : [...contributionPoints.keys()]),
  ];

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

  const entries: LeaderboardEntry[] = userIds
    .map((id) => {
      const user_id = Number(id);

      return {
        rank: 0, // re-ranked after sorting by points
        user_id,
        name: nameMap.get(user_id) ?? `Unknown (${user_id})`,
        points: contributionPoints.get(id) ?? 0,
        avatar: avatarMap.get(user_id) ?? null,
        discord_id: discordMap.get(String(user_id)) ?? null,
        is_alt: altSet.has(String(user_id)),
      };
    })
    .sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  /* ---------------- POINT HISTORY LOGGING ---------------- */
  const battleKey = normalizeKey(
    battleEntry?.key ?? battle?.BattleID ?? battle?.configName ?? title
  );

  await logPointHistory(entries, battleKey);

  const entriesWithMetrics = await attachLiveMetricsAndSnapshot(entries, battleKey);
  const entriesWithDisconnects = await attachDisconnectCounts(entriesWithMetrics);

  return {
    success: true,
    active: true,
    title,
    total_points,
    updatedAt: new Date().toISOString(),
    data: await attachProfileStyles(entriesWithDisconnects),
  };
}

/* ---------------- CACHE WRAPPER ---------------- */

async function getCachedLeaderboard(
  forceRefresh = false
): Promise<LeaderboardResponse> {
  const fresh = cache && Date.now() - cacheTime < CACHE_TTL;

  if (!forceRefresh && fresh && cache) {
    return {
      ...cache,
      data: await attachProfileStyles(cache.data),
    };
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
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  // Discord-role linked badges auto-update: after the response goes out, run a
  // role sweep if one is due. Stale-gated inside (no-op when no badges are
  // role-linked or the last sweep is fresh), and read-only on Discord's side.
  after(async () => {
    try {
      const { maybeAutoSyncBadgeRoles } = await import("@/lib/badgeRoleSync");
      await maybeAutoSyncBadgeRoles({ trigger: "leaderboard-view", budgetMs: 20_000 });
    } catch (syncErr) {
      console.error("[leaderboard] badge role auto-sync failed:", syncErr);
    }
  });

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
