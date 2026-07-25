import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROBLOX_PRESENCE_API = "https://presence.roblox.com/v1/presence/users";

type UserRow = {
  roblox_id: string | number | null;
};

function normalizePresence(value: unknown) {
  const raw = String(value ?? "").trim();
  const numeric = Number(value);

  if (numeric === 0) return { label: "Offline", tone: "offline" };
  if (numeric === 1) return { label: "Online", tone: "online" };
  if (numeric === 2) return { label: "In Game", tone: "ingame" };
  if (numeric === 3) return { label: "In Studio", tone: "studio" };

  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "offline") return { label: "Offline", tone: "offline" };
  if (normalized === "online") return { label: "Online", tone: "online" };
  if (normalized === "ingame" || normalized === "game") return { label: "In Game", tone: "ingame" };
  if (normalized === "instudio" || normalized === "studio") return { label: "In Studio", tone: "studio" };

  return { label: raw || "Unknown", tone: "unknown" };
}

async function getStoredPresence(robloxId: string) {
  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.user_status') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) return null;

    const result = await pool.query<{ status: unknown; updated_at: Date | string | null }>(
      `SELECT status, updated_at
       FROM user_status
       WHERE roblox_id::text = $1
       LIMIT 1`,
      [robloxId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      ...normalizePresence(row.status),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      source: "stored",
    };
  } catch {
    return null;
  }
}

async function getLivePresence(robloxId: string) {
  try {
    const res = await fetch(ROBLOX_PRESENCE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [Number(robloxId)] }),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const json = await res.json().catch(() => ({}));
    const presence = Array.isArray(json?.userPresences) ? json.userPresences[0] : null;
    if (!presence) return null;

    return {
      ...normalizePresence(presence.userPresenceType),
      location: presence.lastLocation || null,
      updatedAt: presence.lastOnline || new Date().toISOString(),
      source: "live",
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const userId = Number(session.user?.id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userResult = await pool.query<UserRow>(
      `SELECT roblox_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const robloxId = String(userResult.rows[0]?.roblox_id ?? "").trim();
    if (!robloxId) {
      return NextResponse.json({
        success: true,
        linked: false,
        status: "Link Roblox",
        tone: "unknown",
        updatedAt: null,
      });
    }

    const presence = (await getLivePresence(robloxId)) ?? (await getStoredPresence(robloxId));

    return NextResponse.json({
      success: true,
      linked: true,
      robloxId,
      status: presence?.label ?? "Unknown",
      tone: presence?.tone ?? "unknown",
      location: presence && "location" in presence ? presence.location : null,
      updatedAt: presence?.updatedAt ?? null,
      source: presence?.source ?? "none",
    });
  } catch (err) {
    console.error("[presence/me] error:", err);
    return NextResponse.json({ error: "Failed to load presence" }, { status: 500 });
  }
}
