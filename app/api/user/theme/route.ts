import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/mcwv_user=([^;]+)/);

    if (!match) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const userId = Number(match[1]);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const theme = typeof body.theme === "string" ? body.theme.trim() : "";

    if (!theme) {
      return NextResponse.json({ error: "Missing theme" }, { status: 400 });
    }

    await pool.query(
      "UPDATE users SET theme = $1 WHERE id = $2",
      [theme, userId]
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save theme" }, { status: 500 });
  }
}
