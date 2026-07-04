import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get("cookie");
    const sessionMatch = cookie?.match(/session=([^;]+)/);

    if (!sessionMatch) {
      return NextResponse.json({ user: null });
    }

    const sessionId = sessionMatch[1];

    const sessionRes = await pool.query(
      `SELECT user_id FROM sessions WHERE id = $1`,
      [sessionId]
    );

    const session = sessionRes.rows[0];

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const userRes = await pool.query(
      `SELECT id, username, roblox_id, discord_id FROM users WHERE id = $1`,
      [session.user_id]
    );

    const user = userRes.rows[0];

    return NextResponse.json({ user: user ?? null });
  } catch (err) {
    return NextResponse.json({ user: null });
  }
}
