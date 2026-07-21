import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"

// Zod validation before database work - matches existing behaviour (min 3 for username, min 6 for password) + adds max limits for safety
const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username must be at most 32 characters."),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters.")
    .max(128, "Password must be at most 128 characters."),
})

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    // Validate input with Zod before any DB work
    const result = signupSchema.safeParse({
      username: body?.username,
      password: body?.password,
    })

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json(
        { error: firstError },
        { status: 400 }
      )
    }

    const { username, password } = result.data

    // Existing duplicate-user handling preserved exactly - SQL unchanged
    const existing = await pool.query(
      `SELECT username, password_hash
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    )

    const passwordHash = await bcrypt.hash(password, 10)

    if (existing.rows.length > 0) {
      const row = existing.rows[0]

      if (row.password_hash) {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 }
        )
      }

      // Update existing user with no password (e.g., imported from Roblox sync)
      await pool.query(
        `UPDATE users
         SET password_hash = $2
         WHERE LOWER(username) = LOWER($1)`,
        [username, passwordHash]
      )

      return NextResponse.json({
        success: true,
        message: "Account created successfully.",
      })
    }

    // Insert new user - SQL unchanged
    await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)`,
      [username, passwordHash]
    )

    // Response success payload unchanged
    return NextResponse.json({
      success: true,
      message: "Account created successfully.",
    })
  } catch (err) {
    // Hide internal errors - generic response, log server-side
    console.error("[auth/signup] error:", err)
    return NextResponse.json(
      {
        success: false,
        error: "Signup failed",
      },
      { status: 500 }
    )
  }
}
