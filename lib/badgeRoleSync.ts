import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { botAdminFetch } from "@/lib/botAdminApi";
import {
  BADGE_CAP,
  collapseExclusiveTiers,
  countBadgeDiff,
  manualSubset,
  mergeDisplayBadges,
  parseBadgeArray,
} from "@/lib/badgeMerge";

/**
 * Badge ⇄ Discord-role sync.
 *
 * Read-only on Discord's side:
 *   GET  /admin/roles          -> role catalogue (picker)
 *   POST /admin/members/roles  -> one cache-backed snapshot for all linked users
 * No Discord roles are edited and no broadcast permission checks are reused.
 */

const LOCK_KEY = "role_sync_lock";
const LAST_KEY = "role_sync_last";
const LOCK_TTL_MS = 90_000;
export const ROLE_SYNC_STALE_MS = 20 * 60 * 1000;
const MAX_BATCH_USERS = 500;

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
  exclusiveTier: boolean;
};

export async function ensureBadgeRoleColumns() {
  // Schema changes are deployment work, not request work. Run
  // db/migrations/2026-08-18-stability-hardening.sql before deploying this
  // release. Keeping this exported no-op avoids churn in the existing routes
  // while eliminating repeated ALTER/CREATE locks from normal traffic.
  return;
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

type BatchMemberRoles = {
  found?: boolean;
  certain?: boolean;
  roles?: unknown;
};

async function fetchMemberRoleMap(
  discordIds: string[]
): Promise<Map<string, Set<string> | null>> {
  const ids = [...new Set(discordIds.map(String).filter(Boolean))];
  if (ids.length > MAX_BATCH_USERS) {
    throw new Error(`Role sync batch exceeds ${MAX_BATCH_USERS} users`);
  }

  const data = await botAdminFetch<{
    success?: boolean;
    members?: Record<string, BatchMemberRoles>;
  }>("/admin/members/roles", {
    method: "POST",
    body: JSON.stringify({ discord_ids: ids }),
  });

  const members = data?.members;
  if (!data?.success || !members || typeof members !== "object") {
    throw new Error("Bot returned an invalid member-role snapshot");
  }

  const result = new Map<string, Set<string> | null>();
  for (const id of ids) {
    const member = members[id];
    if (!member || typeof member !== "object" || member.certain === false) {
      result.set(id, null); // uncertain response: preserve this user's badges
      continue;
    }
    const roles = Array.isArray(member.roles) ? member.roles.map(String) : [];
    // A known non-member has no guild roles, so role-linked badges should be
    // removed. null is reserved for an uncertain lookup and preserves badges.
    result.set(id, new Set(roles));
  }
  return result;
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

type RoleSyncLease = {
  value: string;
};

async function acquireLock(): Promise<RoleSyncLease | null> {
  const owner = randomUUID();
  const value = JSON.stringify({ owner, at: new Date().toISOString() });
  const result = await pool.query<{ value: string }>(
    `INSERT INTO leaderboard_badge_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     WHERE leaderboard_badge_meta.updated_at < NOW() - ($3::double precision * INTERVAL '1 millisecond')
     RETURNING value`,
    [LOCK_KEY, value, LOCK_TTL_MS]
  );
  return result.rows.length ? { value } : null;
}

async function releaseLock(lease: RoleSyncLease) {
  // Match the exact lease value: an expired worker can never release the lock
  // currently held by a newer invocation.
  await pool.query(
    `DELETE FROM leaderboard_badge_meta WHERE key = $1 AND value = $2`,
    [LOCK_KEY, lease.value]
  );
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

  const lease = await acquireLock();
  if (!lease) {
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
      await releaseLock(lease);
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
      exclusive_tier: boolean;
    }>(
      `SELECT badge_key, label, sort_order, linked_discord_role_id, linked_discord_role_name, exclusive_tier
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
      exclusiveTier: Boolean(row.exclusive_tier),
    }));

    if (!presets.length) return finish(base);
    base.presets = presets.length;

    const orderOf = (key: string) =>
      presets.find((p) => p.key === key)?.sortOrder ?? Number.MAX_SAFE_INTEGER / 2;

    // Tier badges are ranked by Discord role position ("Owner hides Head
    // Officer hides Officer"). One catalogue call per sweep, only when any
    // tier badge exists; if the catalogue hiccups we simply skip collapsing —
    // showing one badge too many beats hiding a legit one.
    let tierPositions: Map<string, number> | null = null;
    if (presets.some((preset) => preset.exclusiveTier)) {
      try {
        const catalog = await fetchDiscordRoleCatalog();
        tierPositions = new Map(catalog.map((role) => [role.id, role.position]));
      } catch (catalogErr) {
        console.warn(
          "[badge role sync] role catalogue unavailable — tier collapse skipped this run:",
          catalogErr
        );
      }
    }

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

    if (Date.now() > deadline) {
      return finish({ ...base, ok: false, error: "Budget reached before the role snapshot" });
    }

    // One protected request returns a cache-backed guild role snapshot for all
    // linked users. This replaces the old N-user /broadcast/access fan-out and
    // eliminates the corresponding Discord REST member lookups.
    let rolesByDiscord: Map<string, Set<string> | null>;
    try {
      rolesByDiscord = await fetchMemberRoleMap(
        usersRes.rows.map((user) => String(user.discord_id))
      );
    } catch (snapshotErr) {
      return finish({
        ...base,
        ok: false,
        usersSkipped: usersRes.rows.length,
        error: snapshotErr instanceof Error
          ? snapshotErr.message
          : "Bot member-role snapshot failed",
      });
    }

    const rolesByRoblox = new Map<string, Set<string> | null>();
    for (const user of usersRes.rows) {
      rolesByRoblox.set(
        String(user.roblox_id),
        rolesByDiscord.get(String(user.discord_id)) ?? null
      );
    }
    base.usersSkipped = [...rolesByRoblox.values()].filter((roles) => roles === null).length;

    const reachable = [...rolesByRoblox.values()].filter((roles) => roles !== null).length;
    if (reachable === 0 && rolesByRoblox.size > 0) {
      return finish({
        ...base,
        ok: false,
        error: "Bot member-role snapshot was empty — nothing changed (badges preserved)",
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

      const qualifyingPresets = presets
        .filter((p) => roles.has(p.roleId))
        .map((p) => ({ key: p.key, exclusive: p.exclusiveTier, roleId: p.roleId }));
      const qualifying = (
        tierPositions
          ? collapseExclusiveTiers(qualifyingPresets, (roleId) => tierPositions.get(roleId) ?? null)
          : qualifyingPresets
      ).map((p) => p.key);
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

    return finish(base);
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
