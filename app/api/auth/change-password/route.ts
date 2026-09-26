import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { isDbConnectTimeout, pool } from "@/lib/db"
import bcrypt from "bcryptjs"
import { changePasswordRateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit"

type ChangePasswordBody = {
  currentPassword?: unknown
  newPassword?: unknown
}

export async function POST(req: Request) {
  // Assigned once the session is verified; the catch block refunds these
  // keys when the failure was infrastructure, not a real attempt.
  let rateLimitKeys: string[] | null = null

  try {
    const cookieStore = await cookies()

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    )

    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit on BOTH the client IP and the authenticated user id. IP alone
    // was bypassable via a spoofed X-Forwarded-For header; the user-id bucket
    // can't be spoofed, so repeated password-change attempts for one account
    // stay throttled even when the attacker rotates IPs. (Unauthenticated
    // attempts are rejected above and deliberately not rate-limited - they
    // can't accomplish anything and would only pollute shared buckets.)
    rateLimitKeys = [
      getClientIP(req),
      `pw-user:${session.user.id}`,
    ]
    const rateLimitResult = changePasswordRateLimiter.checkMulti(rateLimitKeys)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body = (await req.json().catch(() => null)) as ChangePasswordBody | null

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : ""

    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : ""

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Missing password fields" },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      )
    }

    const userRes = await pool.query(
      `
        SELECT id, password_hash
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [session.user.id]
    )

    const user = userRes.rows[0]

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    if (!user.password_hash) {
      return NextResponse.json(
        { error: "Account has no password set" },
        { status: 400 }
      )
    }

    const valid = await bcrypt.compare(
      currentPassword,
      user.password_hash
    )

    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      )
    }

    const newHash = await bcrypt.hash(newPassword, 12)

    await pool.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `,
      [newHash, session.user.id]
    )

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error("[auth/change-password] error:", err)
    const busy =
      isDbConnectTimeout(err) ||
      /DATABASE_URL/i.test(err instanceof Error ? err.message : String(err))
    if (busy && rateLimitKeys) {
      // Pooler-wave failure, not a real attempt: refund the counted uses.
      changePasswordRateLimiter.refund(rateLimitKeys)
    }
    return NextResponse.json(
      {
        error: busy
          ? "The hub database is busy. Wait a few seconds and try again."
          : "Failed to change password",
      },
      { status: busy ? 503 : 500 }
    )
  }
}
