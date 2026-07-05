import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getCurrentUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/mcwv_user=([^;]+)/);
  if (!match) return null;

  const userId = Number(match[1]);
  if (!Number.isFinite(userId)) return null;

  const res = await pool.query(
    `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  return res.rows[0] ?? null;
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (me.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = Number(body.user_id);
    const nextRole = String(body.role || "");

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid user_id" }, { status: 400 });
    }

    if (!["member", "officer"].includes(nextRole)) {
      return NextResponse.json(
        { error: "Invalid role. Only member/officer can be assigned here." },
        { status: 400 }
      );
    }

    const targetRes = await pool.query(
      `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    const target = targetRes.rows[0];
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owner role cannot be changed here" },
        { status: 400 }
      );
    }

    await pool.query(
      `UPDATE users
       SET role = $1
       WHERE id = $2`,
      [nextRole, userId]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}
