import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { loginRateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit"

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Missing credentials")
    .max(32, "Username must be at most 32 characters."),
  password: z
    .string()
    .min(1, "Missing credentials")
    .max(128, "Password must be at most 128 characters."),
})

export async function POST(req: Request) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req)
    const rateLimitResult = loginRateLimiter.check(clientIP)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body = await req.json().catch(() => null)

    const result = loginSchema.safeParse({
      username: body?.username,
      password: body?.password,
    })

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Missing credentials"
      // Keep existing behaviour: return 400 for missing, but generic message for security
      return NextResponse.json(
        { error: firstError },
        { status: 400 }
      )
    }

    const { username, password } = result.data

    const userRes = await pool.query(
      `
        SELECT id, username, password_hash, role
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username]
    )

    const user = userRes.rows[0]

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    const match = await bcrypt.compare(
      password,
      user.password_hash
    )

    if (!match) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    const cookieStore = await cookies()

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    )

    session.user = {
      id: Number(user.id),
      username: String(user.username),
      role: user.role ?? null,
    }

    await session.save()

    return NextResponse.json({
      success: true,
      user: {
        id: Number(user.id),
        username: String(user.username),
        role: user.role ?? null,
      },
    })

  } catch (err) {
    console.error("[auth/login] error:", err)
    return NextResponse.json(
      { error: "Login error" },
      { status: 500 }
    )
  }
}
