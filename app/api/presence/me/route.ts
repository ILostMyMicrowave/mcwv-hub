import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getLivePresence, getStoredPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserRow = {
  roblox_id: string | number | null;
};

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
