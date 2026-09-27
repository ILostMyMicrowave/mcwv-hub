import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "@/lib/session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { isDbConnectTimeout, pool } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { loginRateLimiter, getClientIP } from "@/lib/rateLimit"
// War-day resilience: ride out pooler episodes instead of being killed at
// the default cap (the Sep 16 hard failures). Raised 60 -> 300 on Sep 18:
// during Supabase's weekend connect degradation the DB retry ladder can
// legitimately need ~90s to punch through, and the 60s cap turned that into
// a member-facing 504 (prod 2026-09-18 23:04 UTC). Normal logins still
// return in well under a second; this only buys the pathological case
// enough runway to succeed instead of erroring. 300 is the Fluid Hobby cap.
export const maxDuration = 300;


const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter your username and password.")
    .max(32, "Username must be at most 32 characters."),
  password: z
    .string()
    .min(1, "Enter your username and password.")
    .max(128, "Password must be at most 128 characters."),
})

// Real-format bcrypt hash (cost 12, same as live hashes since 2026-09-26) compared
// against when the user doesn't exist, so
// "unknown username" takes the same time as "wrong password" — closes the
// response-timing account-enumeration oracle.
const DUMMY_PASSWORD_HASH = "$2a$12$O7P7U39KiULcUrpVfiIRge65hLZbbJ6l7fWnQW5vQIM9WFLAI.NdK"

function waitLabel(resetMs: number) {
  const seconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

function loginFailure(err: unknown): { error: string; status: number } {
  if (isDbConnectTimeout(err)) {
    return {
      error: "The hub database is busy. Wait a few seconds and try again.",
      status: 503,
    }
  }

  const msg = err instanceof Error ? err.message : String(err)

  if (/DATABASE_URL/i.test(msg)) {
    return {
      error: "Login is temporarily unavailable. Try again in a minute.",
      status: 503,
    }
  }

  if (/password_hash|Illegal arguments|data and hash|hash.*must be/i.test(msg)) {
    return {
      error: "This account isn't set up for password login. Sign up again or ask an officer.",
      status: 400,
    }
  }

  if (/iron-session|password.*secret|unseal|session/i.test(msg)) {
    return {
      error: "Couldn't start your session. Refresh the page and try again.",
      status: 500,
    }
  }

  return {
    error: "Login failed on our side. Refresh and try again.",
    status: 500,
  }
}

export async function POST(req: Request) {
  // Assigned once the body is validated; the catch block refunds these keys
  // when the failure was infrastructure (503), not a credential attempt.
  let rateLimitKeys: string[] | null = null

  try {
    const body = await req.json().catch(() => null)

    const result = loginSchema.safeParse({
      username: body?.username,
      password: body?.password,
    })

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Enter your username and password."
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { username, password } = result.data

    // Rate limit on BOTH the client IP and the target username. IP alone was
    // bypassable via a spoofed X-Forwarded-For header; the username bucket
    // can't be spoofed, so a targeted brute-force on one account stays
    // throttled even when the attacker rotates IPs.
    rateLimitKeys = [
      getClientIP(req),
      `login-user:${username.toLowerCase()}`,
    ]
    const rateLimitResult = loginRateLimiter.checkMulti(rateLimitKeys)
    if (!rateLimitResult.success) {
      const retryAfter = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000))
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${waitLabel(rateLimitResult.reset)}.` },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.reset / 1000)),
          },
        }
      )
    }

    const userRes = await pool.query(
      `
        SELECT id, username, password_hash, role, discord_id
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username]
    )

    const user = userRes.rows[0]

    if (!user) {
      // Timing-oracle guard: spend the same bcrypt cost as a real compare.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
      return NextResponse.json(
        { error: "Wrong username or password." },
        { status: 401 }
      )
    }

    const hash = typeof user.password_hash === "string" ? user.password_hash : ""
    if (!hash.startsWith("$2")) {
      return NextResponse.json(
        { error: "This account isn't set up for password login. Sign up again or ask an officer." },
        { status: 400 }
      )
    }

    const match = await bcrypt.compare(password, hash)

    if (!match) {
      return NextResponse.json(
        { error: "Wrong username or password." },
        { status: 401 }
      )
    }

    const cookieStore = await cookies()

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    )

    // v2 "sign out everywhere": mint a device id and persist it BEFORE the
    // cookie is saved. The row is what makes a cookie real - no login
    // without proof. Old revoked rows are swept here too so the table stays
    // tiny without needing a cron.
    const sid = crypto.randomUUID()
    try {
      await pool.query(
        `INSERT INTO mcwv_user_sessions (sid, user_id, user_agent)
         VALUES ($1, $2, $3)`,
        [sid, Number(user.id), req.headers.get("user-agent")?.slice(0, 500) ?? null]
      )
      void pool
        .query(
          `DELETE FROM mcwv_user_sessions
           WHERE user_id = $1 AND revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days'`,
          [Number(user.id)]
        )
        .catch(() => null)
    } catch (err) {
      console.error("[login] session row failed:", err)
      return NextResponse.json(
        { error: "Could not start your session. Try again in a moment." },
        { status: 500 }
      )
    }

    session.user = {
      id: Number(user.id),
      username: String(user.username),
      sid,
      role: user.role ?? null,
      discordId:
        user.discord_id === null || user.discord_id === undefined
          ? null
          : String(user.discord_id),
    }

    await session.save()

    // A successful login is not a brute-force attempt. Give the counted
    // uses back so a few quick legit logins can't lock an IP or account
    // out of the 5-attempt window.
    loginRateLimiter.refund(rateLimitKeys)

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
    const { error, status } = loginFailure(err)

    if (status === 503 && rateLimitKeys) {
      // Pooler-wave failure, not a credential attempt: refund the counted
      // uses so retrying through the wave can't lock the account out for
      // the rest of the 5-minute window.
      loginRateLimiter.refund(rateLimitKeys)
    }

    return NextResponse.json({ error }, { status })
  }
}
