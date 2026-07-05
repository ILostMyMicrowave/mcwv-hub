import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getCurrentUserId(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/mcwv_user=([^;]+)/);
  if (!match) return null;

  const userId = Number(match[1]);
  if (!Number.isFinite(userId)) return null;

  return userId;
}

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meRes = await pool.query(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    const myRole = meRes.rows[0]?.role ?? "member";
    if (myRole !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const res = await pool.query(
      `SELECT id, username, discord_id, role
       FROM users
       ORDER BY
         CASE role
           WHEN 'owner' THEN 0
           WHEN 'officer' THEN 1
           ELSE 2
         END,
         username ASC`
    );

    return NextResponse.json({ users: res.rows });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 }
    );
  }
}
