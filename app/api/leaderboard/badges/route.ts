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
  exclusive_tier: boolean;
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
  // Present when EDITING an existing preset (key stays stable so cards keep
  // their badges even if the label changes). Absent = create/upsert by slug.
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,48}$/, "Invalid badge key.")
    .optional(),
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
  // Tier badges: of the tier badges a member qualifies for, only the one with
  // the highest Discord role position shows (Owner hides Head Officer hides
  // Officer, etc.). Only meaningful when a Discord role is linked.
  exclusiveTier: z.boolean().default(false),
});

const reorderSchema = z.object({
  keys: z
    .array(z.string().trim().regex(/^[a-z0-9_]{1,48}$/, "Invalid badge key."))
    .min(1)
    .max(200),
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
    exclusiveTier: Boolean(row.exclusive_tier),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function ensureBadgeTables() {
  // Badge schema and the one-time legacy marker are deployment migrations.
  // Request handlers must not run CREATE/ALTER statements or take schema locks.
  return;
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
              linked_discord_role_id, linked_discord_role_name, exclusive_tier, created_at, updated_at
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

    const editKey = parsed.data.key || "";
    const key = editKey || slugifyBadge(parsed.data.label);
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

    if (editKey && !previous.rows.length) {
      return NextResponse.json({ error: "Badge preset not found — it may have been deleted." }, { status: 404 });
    }

    const returningCols = `id, badge_key, label, emoji, color, enabled, sort_order,
                linked_discord_role_id, linked_discord_role_name, exclusive_tier, created_at, updated_at`;

    const result = editKey
      ? // Edit mode: the key is stable, so cards keep their badges even when
        // the label changes. sort_order is untouched (use the reorder arrows).
        await pool.query<BadgePresetRow>(
          `UPDATE leaderboard_badge_presets
           SET label = $2,
               emoji = $3,
               color = $4,
               enabled = $5,
               linked_discord_role_id = $6,
               linked_discord_role_name = $7,
               exclusive_tier = $8,
               updated_at = NOW()
           WHERE badge_key = $1
           RETURNING ${returningCols}`,
          [
            key,
            parsed.data.label,
            emoji || null,
            parsed.data.color,
            parsed.data.enabled,
            nextRoleId,
            parsed.data.linkedDiscordRoleName || null,
            parsed.data.exclusiveTier && Boolean(nextRoleId),
          ]
        )
      : await pool.query<BadgePresetRow>(
          `INSERT INTO leaderboard_badge_presets (
            badge_key,
            label,
            emoji,
            color,
            enabled,
            sort_order,
            linked_discord_role_id,
            linked_discord_role_name,
            exclusive_tier,
            created_by,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (badge_key)
          DO UPDATE SET
            label = EXCLUDED.label,
            emoji = EXCLUDED.emoji,
            color = EXCLUDED.color,
            enabled = EXCLUDED.enabled,
            sort_order = EXCLUDED.sort_order,
            linked_discord_role_id = EXCLUDED.linked_discord_role_id,
            linked_discord_role_name = EXCLUDED.linked_discord_role_name,
            exclusive_tier = EXCLUDED.exclusive_tier,
            updated_at = NOW()
          RETURNING ${returningCols}`,
          [
            key,
            parsed.data.label,
            emoji || null,
            parsed.data.color,
            parsed.data.enabled,
            parsed.data.sortOrder,
            nextRoleId,
            parsed.data.linkedDiscordRoleName || null,
            parsed.data.exclusiveTier && Boolean(nextRoleId),
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

// Reorder presets: body { keys: [...] } becomes the new sort_order (0..n-1).
// Drives picker order, admin pills, and the auto-badge order on cards.
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isOwner(user)) {
      return NextResponse.json({ error: "Only the owner can manage badge presets." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = reorderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid reorder payload" },
        { status: 400 }
      );
    }

    await ensureBadgeTables();

    const keys = parsed.data.keys;
    await pool.query(
      `UPDATE leaderboard_badge_presets AS p
       SET sort_order = v.ord, updated_at = NOW()
       FROM (
         SELECT unnest($1::text[]) AS badge_key, unnest($2::int[]) AS ord
       ) AS v
       WHERE p.badge_key = v.badge_key`,
      [keys, keys.map((_, index) => index)]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[leaderboard/badges] PATCH error:", err);
    return NextResponse.json({ error: "Failed to reorder badge presets" }, { status: 500 });
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
