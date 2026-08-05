import { pool } from "@/lib/db";
import { botAdminFetch } from "@/lib/botAdminApi";
import {
  BADGE_CAP,
  countBadgeDiff,
  manualSubset,
  mergeDisplayBadges,
  parseBadgeArray,
} from "@/lib/badgeMerge";

/**
 * Badge ⇄ Discord-role sync.
 *
 * Read-only on Discord's side: the bot's admin API already exposes
 *   GET  /admin/roles               -> role catalogue (picker)
 *   POST /admin/broadcast/access    -> a member's role ids (per-user lookup)
 * No bot code changes, no Discord roles edited, no hub roles touched.
 */

const LOCK_KEY = "role_sync_lock";
const LAST_KEY = "role_sync_last";
const LOCK_TTL_MS = 90_000;
export const ROLE_SYNC_STALE_MS = 20 * 60 * 1000;
const CHUNK = 4;

export type DiscordRoleSummary = {
  id: string;
  name: string;
  guildId: string;
  guildName: string;
  position: number;
  color: string;
  memberCount: number;
};

export type LinkedPreset = {
  key: string;
  label: string;
  sortOrder: number;
  roleId: string;
  roleName: string | null;
};

export async function ensureBadgeRoleColumns() {
  await pool.query(
    `ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS linked_discord_role_id TEXT`
  );
  await pool.query(
    `ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS linked_discord_role_name TEXT`
  );
  await pool.query(
    `ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS auto_badges JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS leaderboard_badge_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

export async function fetchDiscordRoleCatalog(): Promise<DiscordRoleSummary[]> {
  const data = await botAdminFetch<{ success?: boolean; roles?: Array<Record<string, unknown>> }>(
    "/admin/roles"
  );
  const roles = Array.isArray(data?.roles) ? data.roles : [];
  return roles.map((role) => ({
    id: String(role.id ?? ""),
    name: String(role.name ?? ""),
    guildId: String(role.guildId ?? ""),
    guildName: String(role.guildName ?? ""),
    position: Number(role.position ?? 0),
    color: String(role.color ?? ""),
    memberCount: Number(role.memberCount ?? 0),
  })).filter((role) => role.id && role.name);
}

async function fetchMemberRoleIds(discordId: string): Promise<Set<string> | null> {
  try {
    const data = await botAdminFetch<{ roles?: unknown }>("/admin/broadcast/access", {
      method: "POST",
      body: JSON.stringify({ discord_id: discordId }),
    });
    const roles = Array.isArray(data?.roles) ? data.roles.map(String) : [];
    return new Set(roles);
  } catch {
    return null; // bot hiccup for this user — skip, never strip badges on uncertainty
  }
}

async function getMetaValue(key: string): Promise<string | null> {
  const res = await pool.query<{ value: string | null }>(
    `SELECT value FROM leaderboard_badge_meta WHERE key = $1 LIMIT 1`,
    [key]
  );
  return res.rows[0]?.value ?? null;
}

async function setMetaValue(key: string, value: string) {
  await pool.query(
    `INSERT INTO leaderboard_badge_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

export type RoleSyncMeta = {
  at: string;
  trigger: string;
  ok: boolean;
  presets?: number;
  usersChecked?: number;
  usersSkipped?: number;
  grants?: number;
  removals?: number;
  budgetMs?: number;
  error?: string;
};

export async function getRoleSyncMeta(): Promise<RoleSyncMeta | null> {
  try {
    await ensureBadgeRoleColumns();
    const raw = await getMetaValue(LAST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RoleSyncMeta;
  } catch {
    return null;
  }
}

async function acquireLock(): Promise<boolean> {
  const raw = await getMetaValue(LOCK_KEY);
  if (raw) {
    try {
      const at = new Date((JSON.parse(raw) as { at?: string }).at ?? 0).getTime();
      if (Number.isFinite(at) && Date.now() - at < LOCK_TTL_MS) return false;
    } catch {
      // broken lock value — take it
    }
  }
  await setMetaValue(LOCK_KEY, JSON.stringify({ at: new Date().toISOString() }));
  return true;
}

async function releaseLock() {
  await setMetaValue(LOCK_KEY, JSON.stringify({ at: new Date(0).toISOString() }));
}

export type RoleSyncStats = {
  ok: boolean;
  skippedRun?: boolean;
  presets: number;
  usersChecked: number;
  usersSkipped: number;
  grants: number;
  removals: number;
  durationMs: number;
  error?: string;
};

export async function syncBadgeRoles(opts?: {
  trigger?: string;
  budgetMs?: number;
}): Promise<RoleSyncStats> {
  const trigger = opts?.trigger ?? "manual";
  const budgetMs = opts?.budgetMs ?? 25_000;
  const deadline = Date.now() + budgetMs;
  const started = Date.now();

  const base: RoleSyncStats = {
    ok: true,
    presets: 0,
    usersChecked: 0,
    usersSkipped: 0,
    grants: 0,
    removals: 0,
    durationMs: 0,
  };

  await ensureBadgeRoleColumns();

  if (!(await acquireLock())) {
    return { ...base, skippedRun: true, error: "A sync is already running" };
  }

  const finish = async (stats: RoleSyncStats) => {
    const durationMs = Date.now() - started;
    const finalStats = { ...stats, durationMs };
    try {
      await setMetaValue(
        LAST_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          trigger,
          ok: finalStats.ok,
          presets: finalStats.presets,
          usersChecked: finalStats.usersChecked,
          usersSkipped: finalStats.usersSkipped,
          grants: finalStats.grants,
          removals: finalStats.removals,
          budgetMs,
          error: finalStats.error ?? null,
        })
      );
    } catch {
      // meta is informational only
    }
    try {
      await releaseLock();
    } catch {
      // lock self-expires
    }
    return finalStats;
  };

  try {
    const presetsRes = await pool.query<{
      badge_key: string;
      label: string;
      sort_order: number;
      linked_discord_role_id: string | null;
      linked_discord_role_name: string | null;
    }>(
      `SELECT badge_key, label, sort_order, linked_discord_role_id, linked_discord_role_name
       FROM leaderboard_badge_presets
       WHERE enabled = TRUE
         AND linked_discord_role_id IS NOT NULL
         AND linked_discord_role_id <> ''
       ORDER BY sort_order ASC, label ASC`
    );

    const presets: LinkedPreset[] = presetsRes.rows.map((row) => ({
      key: row.badge_key,
      label: row.label,
      sortOrder: Number(row.sort_order ?? 100),
      roleId: String(row.linked_discord_role_id ?? ""),
      roleName: row.linked_discord_role_name,
    }));

    if (!presets.length) return finish(base);
    base.presets = presets.length;

    const orderOf = (key: string) =>
      presets.find((p) => p.key === key)?.sortOrder ?? Number.MAX_SAFE_INTEGER / 2;

    const usersRes = await pool.query<{
      id: number;
      username: string;
      roblox_id: string | null;
      discord_id: string | null;
    }>(
      `SELECT id, username, roblox_id::text AS roblox_id, discord_id::text AS discord_id
       FROM users
       WHERE discord_id IS NOT NULL
         AND roblox_id IS NOT NULL
         AND roblox_id <> ''`
    );

    if (!usersRes.rows.length) return finish(base);

    // Fetch each user's Discord roles, a few at a time, within budget.
    const rolesByRoblox = new Map<string, Set<string> | null>();
    let hitDeadline = false;
    for (let i = 0; i < usersRes.rows.length; i += CHUNK) {
      if (Date.now() > deadline) {
        hitDeadline = true;
        break;
      }
      const chunk = usersRes.rows.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map(async (user) => {
          const roles = await fetchMemberRoleIds(String(user.discord_id));
          rolesByRoblox.set(String(user.roblox_id), roles);
        })
      );
      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          rolesByRoblox.set(String(chunk[idx].roblox_id), null);
        }
      });
    }
    const unchecked = usersRes.rows.filter((u) => !rolesByRoblox.has(String(u.roblox_id)));
    base.usersSkipped = unchecked.length + [...rolesByRoblox.values()].filter((r) => r === null).length;

    const reachable = [...rolesByRoblox.values()].filter((r) => r !== null).length;
    if (reachable === 0 && rolesByRoblox.size > 0) {
      return finish({
        ...base,
        ok: false,
        error: "Bot admin API unreachable — nothing changed (badges preserved)",
      });
    }

    const robloxIds = [...rolesByRoblox.keys()];
    const stylesRes = robloxIds.length
      ? await pool.query<{ roblox_id: string; badges: unknown; auto_badges: unknown }>(
          `SELECT roblox_id, badges, auto_badges
           FROM user_profile_styles
           WHERE roblox_id = ANY($1)`,
          [robloxIds]
        )
      : { rows: [] };
    const stylesByRoblox = new Map(stylesRes.rows.map((row) => [String(row.roblox_id), row]));

    for (const user of usersRes.rows) {
      const robloxId = String(user.roblox_id);
      const roles = rolesByRoblox.get(robloxId) ?? null;
      if (!roles) continue; // skipped user — badges preserved
      base.usersChecked += 1;

      const qualifying = presets.filter((p) => roles.has(p.roleId)).map((p) => p.key);
      const row = stylesByRoblox.get(robloxId);
      const oldAuto = parseBadgeArray(row?.auto_badges);
      const oldBadges = parseBadgeArray(row?.badges);
      const manual = manualSubset(oldBadges, oldAuto);
      const newBadges = mergeDisplayBadges(manual, qualifying, orderOf, BADGE_CAP);
      const newAuto = newBadges.filter((key) => qualifying.includes(key));

      const same =
        oldAuto.join("\n") === newAuto.join("\n") &&
        oldBadges.join("\n") === newBadges.join("\n");
      if (same) continue;

      const diff = countBadgeDiff(oldBadges, newBadges);
      base.grants += diff.added;
      base.removals += diff.removed;

      await pool.query(
        `INSERT INTO user_profile_styles (roblox_id, badges, auto_badges, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, NOW())
         ON CONFLICT (roblox_id)
         DO UPDATE SET
           badges = EXCLUDED.badges,
           auto_badges = EXCLUDED.auto_badges,
           updated_at = NOW()`,
        [robloxId, JSON.stringify(newBadges), JSON.stringify(newAuto)]
      );
    }

    return finish({
      ...base,
      error: hitDeadline ? `Budget reached — ${unchecked.length} users land next run` : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Role sync failed";
    return finish({ ...base, ok: false, error: message });
  }
}

/** Run a sweep only when the last one is stale and links exist. */
export async function maybeAutoSyncBadgeRoles(opts?: {
  staleMs?: number;
  budgetMs?: number;
  trigger?: string;
}) {
  const staleMs = opts?.staleMs ?? ROLE_SYNC_STALE_MS;
  try {
    await ensureBadgeRoleColumns();
    const linked = await pool.query(
      `SELECT 1 FROM leaderboard_badge_presets
       WHERE enabled = TRUE AND linked_discord_role_id IS NOT NULL AND linked_discord_role_id <> ''
       LIMIT 1`
    );
    if (!linked.rows.length) return { ran: false, reason: "no links" as const };

    const meta = await getRoleSyncMeta();
    if (meta?.at && Date.now() - new Date(meta.at).getTime() < staleMs) {
      return { ran: false, reason: "fresh" as const };
    }

    const stats = await syncBadgeRoles({
      trigger: opts?.trigger ?? "auto",
      budgetMs: opts?.budgetMs ?? 20_000,
    });
    return { ran: true, stats };
  } catch (err) {
    console.error("[badge role sync] maybe-auto failed:", err);
    return { ran: false, reason: "error" as const };
  }
}

/** Strip a badge key from BOTH display + auto arrays (preset deleted). */
export async function stripBadgeEverywhere(key: string) {
  await pool.query(
    `UPDATE user_profile_styles
     SET badges = COALESCE((
       SELECT jsonb_agg(value)
       FROM jsonb_array_elements_text(badges) AS value
       WHERE value <> $1
     ), '[]'::jsonb),
     auto_badges = COALESCE((
       SELECT jsonb_agg(value)
       FROM jsonb_array_elements_text(auto_badges) AS value
       WHERE value <> $1
     ), '[]'::jsonb)
     WHERE badges ? $1 OR auto_badges ? $1`,
    [key]
  );
}

/** Strip a badge key from the MANUAL subset only (badge became role-linked). */
export async function stripManualBadgeEverywhere(key: string) {
  await pool.query(`ALTER TABLE user_profile_styles ADD COLUMN IF NOT EXISTS auto_badges JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(
    `UPDATE user_profile_styles
     SET badges = COALESCE((
       SELECT jsonb_agg(value)
       FROM jsonb_array_elements_text(badges) AS value
       WHERE value <> $1 OR value IN (SELECT jsonb_array_elements_text(auto_badges))
     ), '[]'::jsonb)
     WHERE badges ? $1`,
    [key]
  );
}
