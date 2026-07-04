import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/mcwv_user=([^;]+)/);

    if (!match) {
      return NextResponse.json({ user: null });
    }

    const userId = Number(match[1]);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ user: null });
    }

    const result = await pool.query(
      "SELECT id, username, roblox_id, discord_id, theme FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    const user = result.rows[0] ?? null;

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
