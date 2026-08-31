import { NextResponse } from "next/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { pool } from "@/lib/db"
import { forgotPasswordRateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  token: z.string().trim().min(16).max(128),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters.")
    .max(128, "Password must be at most 128 characters."),
})

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse({
      token: body?.token,
      password: body?.password,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid reset request." },
        { status: 400 }
      )
    }

    const { token, password } = parsed.data
    const rateLimitResult = forgotPasswordRateLimiter.checkMulti([
      `reset:${getClientIP(req)}`,
      `reset-token:${token.slice(0, 12)}`,
    ])
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const tokenHash = hashToken(token)
    const row = await pool.query<{
      id: number
      user_id: number
      expires_at: Date | string
      used_at: Date | string | null
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    )
    const rec = row.rows[0]
    if (!rec || rec.used_at) {
      return NextResponse.json(
        { error: "This reset link is invalid or already used." },
        { status: 400 }
      )
    }
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This reset link expired. Request a new one." },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      passwordHash,
      rec.user_id,
    ])
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [rec.id]
    )
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [rec.user_id]
    )

    return NextResponse.json({
      success: true,
      message: "Password updated. You can log in now.",
    })
  } catch (err) {
    console.error("[auth/reset-password] error:", err)
    return NextResponse.json({ error: "Couldn't reset that password." }, { status: 500 })
  }
}
