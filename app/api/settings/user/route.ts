import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ---------------- GET USER THEME ---------------- */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user_id = url.searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json(
        { error: "Missing user_id" },
        { status: 400 }
      );
    }

    const res = await pool.query(
      `SELECT theme FROM user_settings WHERE user_id = $1`,
      [user_id]
    );

    const row = res.rows[0];

    return NextResponse.json({
      user_id,
      theme: row?.theme ?? "default",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load user settings" },
      { status: 500 }
    );
  }
}

/* ---------------- UPDATE USER THEME ---------------- */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const user_id = body.user_id;
    const theme = body.theme;

    if (!user_id || !theme) {
      return NextResponse.json(
        { error: "Missing user_id or theme" },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      `SELECT user_id FROM user_settings WHERE user_id = $1`,
      [user_id]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO user_settings (user_id, theme)
         VALUES ($1, $2)`,
        [user_id, theme]
      );
    } else {
      await pool.query(
        `UPDATE user_settings
         SET theme = $2,
             updated_at = NOW()
         WHERE user_id = $1`,
        [user_id, theme]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    );
  }
}
