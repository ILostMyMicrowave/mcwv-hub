import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";
import { BotAdminApiError } from "@/lib/botAdminApi";
import { ensureBadgeRoleColumns, fetchDiscordRoleCatalog } from "@/lib/badgeRoleSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

// Discord role catalogue (via the bot, read-only) for the badge editor dropdown.
export async function GET() {
  try {
    const user = await getOfficerUser();
    if (!user) {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    await ensureBadgeRoleColumns();
    const roles = await fetchDiscordRoleCatalog();
    return NextResponse.json({ success: true, roles });
  } catch (err) {
    const message =
      err instanceof BotAdminApiError
        ? err.message
        : "Could not load Discord roles from the bot.";
    const status = err instanceof BotAdminApiError ? err.status || 502 : 500;
    return NextResponse.json({ error: message, roles: [] }, { status });
  }
}
