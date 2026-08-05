import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";
import { BotAdminApiError } from "@/lib/botAdminApi";
import {
  getRoleSyncMeta,
  syncBadgeRoles,
} from "@/lib/badgeRoleSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// A full sweep fans out to the bot per member — give it room on Hobby.
export const maxDuration = 60;

async function getOfficerUser() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const userId = Number(session.user?.id);
  if (!Number.isFinite(userId)) return null;

  const result = await pool.query<{ id: number }>(
    `SELECT id FROM users
     WHERE id = $1 AND (role = 'owner' OR role = 'officer')
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function GET() {
  try {
    const user = await getOfficerUser();
    if (!user) {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }
    const meta = await getRoleSyncMeta();
    return NextResponse.json({ success: true, meta });
  } catch (err) {
    console.error("[badges/sync] GET error:", err);
    return NextResponse.json({ error: "Failed to load sync status" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getOfficerUser();
    if (!user) {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    const stats = await syncBadgeRoles({ trigger: "manual", budgetMs: 45_000 });
    if (!stats.ok) {
      return NextResponse.json(
        { error: stats.error || "Role sync failed", stats },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, stats });
  } catch (err) {
    const message =
      err instanceof BotAdminApiError ? err.message : "Role sync failed";
    const status = err instanceof BotAdminApiError ? err.status || 502 : 500;
    console.error("[badges/sync] POST error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
