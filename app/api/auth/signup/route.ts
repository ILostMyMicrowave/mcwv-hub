import { NextResponse } from "next/server";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type SignupBody = {
  username?: unknown;
  password?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignupBody;

    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      `SELECT username, password_hash
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    );

    const passwordHash = await bcrypt.hash(password, 10);

    if (existing.rows.length > 0) {
      const row = existing.rows[0];

      if (row.password_hash) {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 }
        );
      }

      await pool.query(
        `UPDATE users
         SET password_hash = $2
         WHERE LOWER(username) = LOWER($1)`,
        [username, passwordHash]
      );

      return NextResponse.json({
        success: true,
        message: "Account created successfully.",
      });
    }

    await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)`,
      [username, passwordHash]
    );

    return NextResponse.json({
      success: true,
      message: "Account created successfully.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create account.",
      },
      { status: 500 }
    );
  }
}
