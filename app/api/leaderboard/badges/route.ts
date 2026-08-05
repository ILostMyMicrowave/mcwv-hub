import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { z } from "zod";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Linking a badge kicks a role sweep after the response — give it room on Hobby.
export const maxDuration = 60;

type BadgePresetRow = {
  id: number;
  badge_key: string;
  label: string;
  emoji: string | null;
  color: string;
  enabled: boolean;
  sort_order: number;
  linked_discord_role_id: string | null;
  linked_discord_role_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CurrentUser = {
  id: number;
  username: string;
  role: "member" | "officer" | "owner" | string | null;
};

const badgeSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1, "Badge label is required.").max(32, "Badge label is too long."),
  emoji: z.string().trim().max(16).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a valid hex colour, e.g. #34d399."),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(100),
  // Optional Discord-role link: members holding this role get the badge
  // pinned automatically (read-only on Discord; nothing edits any roles).
  linkedDiscordRoleId: z
    .string()
    .trim()
    .regex(/^\d{15,25}$/, "Discord role IDs are 15-25 digits.")
    .nullable()
    .optional(),
  linkedDiscordRoleName: z.string().trim().max(100).nullable().optional(),
});

function isOwner(user: CurrentUser | null) {
  return user?.role === "owner";
}

function isOfficer(user: CurrentUser | null) {
  return user?.role === "owner" || user?.role === "officer";
}

function slugifyBadge(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "badge";
}

function isSingleEmoji(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return true;
  if (/[A-Za-z0-9]/.test(trimmed)) return false;
  if (Array.from(trimmed).length > 8) return false;
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\uFE0E)?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\uFE0E)?)*$/u.test(trimmed);
}

function normalizePreset(row: BadgePresetRow) {
  return {
    id: Number(row.id),
    key: row.badge_key,
    label: row.label,
    emoji: row.emoji ?? "",
    color: row.color,
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order ?? 100),
    linkedDiscordRoleId: row.linked_discord_role_id ?? null,
    linkedDiscordRoleName: row.linked_discord_role_name ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function ensureBadgeTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard_badge_presets (
      id BIGSERIAL PRIMARY KEY,
      badge_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      emoji TEXT,
      color TEXT NOT NULL DEFAULT '#34d399',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS badge_key TEXT`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS label TEXT`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS emoji TEXT`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#34d399'`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS created_by INTEGER`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_badge_presets_key_idx ON leaderboard_badge_presets (badge_key)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS leaderboard_badge_presets_enabled_order_idx ON leaderboard_badge_presets (enabled, sort_order, label)`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS linked_discord_role_id TEXT`);
  await pool.query(`ALTER TABLE leaderboard_badge_presets ADD COLUMN IF NOT EXISTS linked_discord_role_name TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard_badge_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migration = await pool.query<{ key: string }>(
    `INSERT INTO leaderboard_badge_meta (key, value, updated_at)
     VALUES ('legacy_badges_cleared', 'true', NOW())
     ON CONFLICT (key) DO NOTHING
     RETURNING key`
  );

  if (migration.rows.length > 0) {
    const stylesTable = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.user_profile_styles') IS NOT NULL AS exists`
    );

    if (stylesTable.rows[0]?.exists) {
      await pool.query(`UPDATE user_profile_styles SET badges = '[]'::jsonb`);
    }
  }
}

async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const userId = Number(session.user?.id);

  if (!Number.isFinite(userId)) return null;

  const result = await pool.query<CurrentUser>(
    `SELECT id, username, role
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureBadgeTables();

    const result = await pool.query<BadgePresetRow>(
      `SELECT id, badge_key, label, emoji, color, enabled, sort_order,
              linked_discord_role_id, linked_discord_role_name, created_at, updated_at
       FROM leaderboard_badge_presets
       WHERE enabled = TRUE OR $1 = TRUE
       ORDER BY sort_order ASC, label ASC`,
      [isOwner(user)]
    );

    let syncMeta = null;
    try {
      const { getRoleSyncMeta } = await import("@/lib/badgeRoleSync");
      syncMeta = await getRoleSyncMeta();
    } catch {
      // meta is informational only
    }

    return NextResponse.json({
      success: true,
      canManagePresets: isOwner(user),
      canAssignBadges: isOfficer(user),
      presets: result.rows.map(normalizePreset),
      sync: syncMeta,
    });
  } catch (err) {
    console.error("[leaderboard/badges] GET error:", err);
    return NextResponse.json({ error: "Failed to load badge presets" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isOwner(user)) {
      return NextResponse.json({ error: "Only the owner can manage badge presets." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = badgeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid badge preset" },
        { status: 400 }
      );
    }

    const emoji = parsed.data.emoji?.trim() ?? "";
    if (!isSingleEmoji(emoji)) {
      return NextResponse.json({ error: "Badge emoji must be one emoji only, or blank." }, { status: 400 });
    }

    await ensureBadgeTables();

    const key = slugifyBadge(parsed.data.label);
    const nextRoleId = parsed.data.linkedDiscordRoleId || null;

    // Read the previous link so transitions can be handled precisely:
    //   null -> role   = newly linked (strip manual pins, sync now)
    //   role -> role'  = re-linked to a different role (same handling)
    //   role -> null   = unlinked (clear auto badges off cards)
    //   role -> role   = unrelated edit (leave cards alone)
    const previous = await pool.query<{ linked_discord_role_id: string | null }>(
      `SELECT linked_discord_role_id
       FROM leaderboard_badge_presets
       WHERE badge_key = $1
       LIMIT 1`,
      [key]
    );
    const prevRoleId = previous.rows[0]?.linked_discord_role_id || null;

    const result = await pool.query<BadgePresetRow>(
      `INSERT INTO leaderboard_badge_presets (
        badge_key,
        label,
        emoji,
        color,
        enabled,
        sort_order,
        linked_discord_role_id,
        linked_discord_role_name,
        created_by,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (badge_key)
      DO UPDATE SET
        label = EXCLUDED.label,
        emoji = EXCLUDED.emoji,
        color = EXCLUDED.color,
        enabled = EXCLUDED.enabled,
        sort_order = EXCLUDED.sort_order,
        linked_discord_role_id = EXCLUDED.linked_discord_role_id,
        linked_discord_role_name = EXCLUDED.linked_discord_role_name,
        updated_at = NOW()
      RETURNING id, badge_key, label, emoji, color, enabled, sort_order,
                linked_discord_role_id, linked_discord_role_name, created_at, updated_at`,
      [
        key,
        parsed.data.label,
        emoji || null,
        parsed.data.color,
        parsed.data.enabled,
        parsed.data.sortOrder,
        parsed.data.linkedDiscordRoleId || null,
        parsed.data.linkedDiscordRoleName || null,
        Number(user.id),
      ]
    );

    const roleSync = await import("@/lib/badgeRoleSync");

    if (nextRoleId && prevRoleId !== nextRoleId) {
      // Newly (re-)linked: the badge becomes auto-managed. Wipe manual pins so
      // the sweep owns its presence on cards, then sync right away — the owner
      // should see role members get the badge within seconds.
      try {
        await roleSync.stripManualBadgeEverywhere(key);
      } catch (stripErr) {
        console.error("[leaderboard/badges] manual-strip after link failed:", stripErr);
      }
      after(async () => {
        try {
          await roleSync.syncBadgeRoles({ trigger: "preset-link", budgetMs: 25_000 });
        } catch (syncErr) {
          console.error("[leaderboard/badges] post-link sync failed:", syncErr);
        }
      });
    } else if (!nextRoleId && prevRoleId) {
      // Unlinked: nothing recomputes this badge anymore, so stale auto-granted
      // copies would stick to cards forever — strip them everywhere.
      try {
        await roleSync.stripBadgeEverywhere(key);
      } catch (stripErr) {
        console.error("[leaderboard/badges] strip after unlink failed:", stripErr);
      }
    }

    return NextResponse.json({ success: true, preset: normalizePreset(result.rows[0]) });
  } catch (err) {
    console.error("[leaderboard/badges] POST error:", err);
    return NextResponse.json({ error: "Failed to save badge preset" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isOwner(user)) {
      return NextResponse.json({ error: "Only the owner can manage badge presets." }, { status: 403 });
    }

    const url = new URL(req.url);
    const key = url.searchParams.get("key")?.trim();

    if (!key) {
      return NextResponse.json({ error: "Badge key is required." }, { status: 400 });
    }

    await ensureBadgeTables();

    await pool.query(`DELETE FROM leaderboard_badge_presets WHERE badge_key = $1`, [key]);

    const stylesTable = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.user_profile_styles') IS NOT NULL AS exists`
    );

    if (stylesTable.rows[0]?.exists) {
      // strip from BOTH the display array and the auto (role-synced) array
      const { stripBadgeEverywhere } = await import("@/lib/badgeRoleSync");
      await stripBadgeEverywhere(key);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[leaderboard/badges] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete badge preset" }, { status: 500 });
  }
}
