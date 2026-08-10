import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { z } from "zod"
import { signupRateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit"

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
  verificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
})

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex")
}

async function ensureSignupVerificationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_verification_codes (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`CREATE INDEX IF NOT EXISTS signup_verification_user_idx ON signup_verification_codes (user_id, created_at DESC)`)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    const result = signupSchema.safeParse({
      username: body?.username,
      password: body?.password,
      verificationCode: body?.verificationCode,
    })

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json(
        { error: firstError },
        { status: 400 }
      )
    }

    const { username, password, verificationCode } = result.data

    // Rate limit on BOTH the client IP and the target username. IP alone was
    // bypassable via a spoofed X-Forwarded-For header; the username bucket
    // can't be spoofed, so repeated signup attempts for one account stay
    // throttled even when the attacker rotates IPs.
    const rateLimitResult = signupRateLimiter.checkMulti([
      getClientIP(req),
      `signup-user:${username.toLowerCase()}`,
    ])
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const existing = await pool.query<{
      id: number
      username: string
      password_hash: string | null
      roblox_id: string | number | null
      discord_id: string | number | null
    }>(
      `SELECT id, username, password_hash, roblox_id, discord_id
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    )

    const user = existing.rows[0]

    if (!user?.roblox_id || !user?.discord_id) {
      return NextResponse.json(
        { error: "That Roblox account is not linked to an MCWV Discord member yet." },
        { status: 403 }
      )
    }

    if (user.password_hash) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      )
    }

    await ensureSignupVerificationTable()

    const codeResult = await pool.query<{
      id: number
      code_hash: string
      attempts: number
      expires_at: Date | string
    }>(
      `SELECT id, code_hash, attempts, expires_at
       FROM signup_verification_codes
       WHERE user_id = $1
         AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    )

    const codeRow = codeResult.rows[0]
    if (!codeRow) {
      return NextResponse.json(
        { error: "Request a verification code first." },
        { status: 400 }
      )
    }

    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "That verification code expired. Request a new one." },
        { status: 400 }
      )
    }

    if (Number(codeRow.attempts ?? 0) >= 5) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new verification code." },
        { status: 429 }
      )
    }

    const ok = crypto.timingSafeEqual(
      Buffer.from(codeRow.code_hash),
      Buffer.from(hashCode(verificationCode))
    )

    if (!ok) {
      await pool.query(
        `UPDATE signup_verification_codes
         SET attempts = attempts + 1
         WHERE id = $1`,
        [codeRow.id]
      )
      return NextResponse.json({ error: "Incorrect verification code." }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    await pool.query(
      `UPDATE users
       SET password_hash = $2
       WHERE id = $1`,
      [user.id, passwordHash]
    )

    await pool.query(
      `UPDATE signup_verification_codes
       SET used_at = NOW()
       WHERE id = $1`,
      [codeRow.id]
    )

    return NextResponse.json({
      success: true,
      message: "Account verified and created successfully.",
    })
  } catch (err) {
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
