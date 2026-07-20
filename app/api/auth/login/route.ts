import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import pg from "pg";
import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as LoginBody | null;

    const username =
      typeof body?.username === "string" ? body.username.trim() : "";

    const password =
      typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 }
      );
    }

    const userRes = await pool.query(
      `
        SELECT id, username, password_hash, role
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username]
    );

    const user = userRes.rows[0];

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const match = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!match) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    );

    session.user = {
      id: Number(user.id),
      username: String(user.username),
      role: user.role ?? null,
    };

    await session.save();

    return NextResponse.json({
      success: true,
      user: {
        id: Number(user.id),
        username: String(user.username),
        role: user.role ?? null,
      },
    });

  } catch {
    return NextResponse.json(
      { error: "Login error" },
      { status: 500 }
    );
  }
}
