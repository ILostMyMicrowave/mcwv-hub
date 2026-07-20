import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import pg from "pg";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    const cookieStore = await cookies();

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    );

    if (!session.user?.id) {
      return NextResponse.json({ user: null });
    }

    const result = await pool.query(
      `
        SELECT id, username, roblox_id, discord_id, role, theme
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [session.user.id]
    );

    const user = result.rows[0] ?? null;

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
