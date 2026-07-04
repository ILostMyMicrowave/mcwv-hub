import { NextResponse } from "next/server";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 }
      );
    }

    // 1. find user
    const userRes = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    const user = userRes.rows[0];

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // 2. check password
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // 3. create session (simple version for now)
    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
      },
    });

    res.cookies.set("mcwv_user", String(user.id), {
      httpOnly: true,
      path: "/",
    });

    return res;
  } catch (err) {
    return NextResponse.json(
      { error: "Login error" },
      { status: 500 }
    );
  }
}
