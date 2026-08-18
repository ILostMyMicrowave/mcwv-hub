import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { z } from "zod";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";
import { mergeDisplayBadges, parseBadgeArray } from "@/lib/badgeMerge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BACKGROUND_PRESETS = new Set([
  "default",
  "emerald_forest",
  "ice",
  "inferno",
  "galaxy",
  "neon",
  "glass",
]);

const FRAME_PRESETS = new Set([
  "none",
  "emerald",
  "ice",
  "inferno",
  "gold",
  "violet",
  "owner",
  "officer",
  "crown",
  "laurel",
  "neon_pulse",
  "galaxy_orbit",
  "diamond",
  "custom",
]);

const FONT_PRESETS = new Set([
  "default",
  "nitro_block",
  "terminal_mono",
  "royal_serif",
  "rounded_bold",
  "varsity",
  "tech",
]);

const FONT_PRESET_ALIASES: Record<string, string> = {
  gg_sans: "default",
  display: "nitro_block",
  rounded: "rounded_bold",
  mono: "terminal_mono",
  mono_terminal: "terminal_mono",
  serif: "royal_serif",
  comic: "rounded_bold",
  handwritten: "rounded_bold",
  blackletter: "varsity",
  arcade: "tech",
};

function normalizeFontPreset(value: string) {
  return FONT_PRESET_ALIASES[value] ?? value;
}

function isSingleEmoji(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return true;
  if (/[A-Za-z0-9]/.test(trimmed)) return false;
  const segments = Array.from(trimmed);
  if (segments.length > 8) return false;
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\uFE0E)?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\uFE0E)?)*$/u.test(trimmed);
}

const styleSchema = z.object({
  backgroundUrl: z.string().trim().max(500).nullable().optional(),
  backgroundPreset: z.string().trim().max(40).default("default"),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a valid hex colour, e.g. #34d399."),
  framePreset: z.string().trim().max(40).default("none"),
  framePrimaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#34d399"),
  frameSecondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#38bdf8"),
  frameEmoji: z.string().trim().max(16).nullable().optional(),
  fontPreset: z.string().trim().max(40).default("default"),
  bio: z.string().trim().max(220).nullable().optional(),
  badges: z.array(z.string().trim().max(64)).max(8).default([]),
});

async function ensureBadgePresetTable() {
  // Badge preset schema is applied once by
  // db/migrations/2026-08-18-stability-hardening.sql.
  return;
}

async function normalizeAssignableBadges(badges: string[]) {
  const requested = [...new Set(badges.map((badge) => badge.trim()).filter(Boolean))].slice(0, 8);
  if (!requested.length) return [];

  await ensureBadgePresetTable();

  const result = await pool.query<{ badge_key: string }>(
    `SELECT badge_key
     FROM leaderboard_badge_presets
     WHERE enabled = TRUE
       AND badge_key = ANY($1)
       AND linked_discord_role_id IS NULL`,
    [requested]
  );

  const allowed = new Set(result.rows.map((row) => row.badge_key));
  const invalid = requested.filter((badge) => !allowed.has(badge));

  if (invalid.length) {
    throw new Error("Badges must be selected from the owner-approved preset list.");
  }

  return requested;
}

async function ensureProfileStylesTable() {
  // Profile style schema is applied once by
  // db/migrations/2026-08-18-stability-hardening.sql.
  return;
}

function isOfficerRole(role: unknown) {
  return role === "owner" || role === "officer";
}

async function getSessionUser() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (!session.user?.id) return null;

  const result = await pool.query(
    `SELECT id, username, roblox_id, role
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [session.user.id]
  );

  return result.rows[0] ?? null;
}

function backgroundTypeFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".mp4") || clean.endsWith(".webm")) return "video";
  if (clean.endsWith(".gif")) return "gif";
  return "image";
}

function validateBackgroundUrl(url: string | null | undefined) {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Background URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Background URL must use HTTPS.");
  }

  const pathname = parsed.pathname.toLowerCase();
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm"];
  if (!allowed.some((extension) => pathname.endsWith(extension))) {
    throw new Error("Background URL must end in jpg, png, webp, gif, mp4, or webm.");
  }

  return parsed.toString();
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.roblox_id) {
      return NextResponse.json({ error: "Link your Roblox account before customising your card." }, { status: 400 });
    }

    const url = new URL(req.url);
    const requestedRobloxId = url.searchParams.get("robloxId")?.trim();
    const canManageCards = isOfficerRole(user.role);
    const targetRobloxId = requestedRobloxId && canManageCards
      ? requestedRobloxId
      : String(user.roblox_id);

    if (requestedRobloxId && requestedRobloxId !== String(user.roblox_id) && !canManageCards) {
      return NextResponse.json({ error: "Only officers can edit another member's card." }, { status: 403 });
    }

    await ensureProfileStylesTable();

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
              badges,
              updated_at
       FROM user_profile_styles
       WHERE roblox_id = $1
       LIMIT 1`,
      [targetRobloxId]
    );

    return NextResponse.json({
      success: true,
      robloxId: targetRobloxId,
      canManageCards,
      canEditBadges: canManageCards,
      style: result.rows[0] ?? null,
    });
  } catch (err) {
    console.error("[leaderboard/style] GET error:", err);
    return NextResponse.json({ error: "Failed to load style" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.roblox_id) {
      return NextResponse.json({ error: "Link your Roblox account before customising your card." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = styleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid style" }, { status: 400 });
    }

    const canManageCards = isOfficerRole(user.role);
    const requestedTarget = typeof body?.targetRobloxId === "string" || typeof body?.targetRobloxId === "number"
      ? String(body.targetRobloxId).trim()
      : "";
    const targetRobloxId = requestedTarget || String(user.roblox_id);

    if (targetRobloxId !== String(user.roblox_id) && !canManageCards) {
      return NextResponse.json({ error: "Only officers can edit another member's card." }, { status: 403 });
    }

    if (!/^\d{2,20}$/.test(targetRobloxId)) {
      return NextResponse.json({ error: "Invalid target Roblox ID." }, { status: 400 });
    }

    if (!BACKGROUND_PRESETS.has(parsed.data.backgroundPreset)) {
      return NextResponse.json({ error: "Unknown background preset." }, { status: 400 });
    }

    if (!FRAME_PRESETS.has(parsed.data.framePreset)) {
      return NextResponse.json({ error: "Unknown frame preset." }, { status: 400 });
    }

    const fontPreset = normalizeFontPreset(parsed.data.fontPreset);
    if (!FONT_PRESETS.has(fontPreset)) {
      return NextResponse.json({ error: "Unknown font preset." }, { status: 400 });
    }

    const frameEmoji = String(parsed.data.frameEmoji ?? "").trim();
    if (!isSingleEmoji(frameEmoji)) {
      return NextResponse.json({ error: "Frame emoji must be one emoji only, or blank." }, { status: 400 });
    }

    const backgroundUrl = validateBackgroundUrl(parsed.data.backgroundUrl || null);
    const backgroundType = backgroundTypeFromUrl(backgroundUrl);

    await ensureProfileStylesTable();

    let badges: string[] = [];
    const existing = await pool.query<{ badges: unknown; auto_badges: unknown }>(
      `SELECT badges, auto_badges FROM user_profile_styles WHERE roblox_id = $1 LIMIT 1`,
      [targetRobloxId]
    );
    if (canManageCards) {
      // Officers edit the MANUAL pins; role-linked (auto) badges ride along
      // untouched and are re-merged into the display order after them.
      const selected = await normalizeAssignableBadges(parsed.data.badges);
      const autoBadges = parseBadgeArray(existing.rows[0]?.auto_badges);
      if (autoBadges.length) {
        const orderRes = await pool.query<{ badge_key: string; sort_order: number }>(
          `SELECT badge_key, sort_order FROM leaderboard_badge_presets`
        );
        const orderOf = (key: string) => {
          const row = orderRes.rows.find((r) => r.badge_key === key);
          return row ? Number(row.sort_order ?? 100) : Number.MAX_SAFE_INTEGER / 2;
        };
        badges = mergeDisplayBadges(selected, autoBadges, orderOf);
      } else {
        badges = selected;
      }
    } else {
      badges = parseBadgeArray(existing.rows[0]?.badges).slice(0, 8);
    }

    const result = await pool.query(
      `INSERT INTO user_profile_styles (
        roblox_id,
        user_id,
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
        badges,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
      ON CONFLICT (roblox_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        background_url = EXCLUDED.background_url,
        background_type = EXCLUDED.background_type,
        background_preset = EXCLUDED.background_preset,
        accent_color = EXCLUDED.accent_color,
        frame_preset = EXCLUDED.frame_preset,
        frame_primary_color = EXCLUDED.frame_primary_color,
        frame_secondary_color = EXCLUDED.frame_secondary_color,
        frame_emoji = EXCLUDED.frame_emoji,
        font_preset = EXCLUDED.font_preset,
        bio = EXCLUDED.bio,
        badges = EXCLUDED.badges,
        updated_at = NOW()
      RETURNING roblox_id,
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
                badges,
                updated_at`,
      [
        targetRobloxId,
        Number(user.id),
        backgroundUrl,
        backgroundType,
        parsed.data.backgroundPreset,
        parsed.data.accentColor,
        parsed.data.framePreset,
        parsed.data.framePrimaryColor,
        parsed.data.frameSecondaryColor,
        frameEmoji,
        fontPreset,
        parsed.data.bio || null,
        JSON.stringify(badges),
      ]
    );

    return NextResponse.json({
      success: true,
      robloxId: targetRobloxId,
      canManageCards,
      canEditBadges: canManageCards,
      style: result.rows[0],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save style";
    console.error("[leaderboard/style] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
