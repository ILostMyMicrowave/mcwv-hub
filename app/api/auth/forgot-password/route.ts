import { NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"
import { forgotPasswordRateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  discordUsername: z
    .string()
    .trim()
    .min(2, "Enter your Discord username.")
    .max(32, "Discord username is too long."),
})

const GENERIC_OK =
  "If that Discord is linked to a Hub login, you'll get a DM with a reset link."

function hubOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.MCWV_HUB_URL?.trim() ||
    process.env.HUB_URL?.trim() ||
    "https://mcwv-hub.vercel.app"
  ).replace(/\/$/, "")
}

async function ensureResetTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id, created_at DESC)`
  )
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse({
      discordUsername: String(body?.discordUsername || "").replace(/^@+/, ""),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Enter your Discord username." },
        { status: 400 }
      )
    }

    const discordUsername = parsed.data.discordUsername

    const rateLimitResult = forgotPasswordRateLimiter.checkMulti([
      `forgot:${getClientIP(req)}`,
      `forgot-user:${discordUsername.toLowerCase()}`,
    ])
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    let discordId: string | null = null
    try {
      const lookup = await botAdminFetch<{ discord_id?: string | null }>(
        "/admin/lookup-discord-username",
        {
          method: "POST",
          body: JSON.stringify({ username: discordUsername }),
        }
      )
      discordId = lookup?.discord_id ? String(lookup.discord_id) : null
    } catch (err) {
      console.error("[forgot-password] lookup:", err)
      if (err instanceof BotAdminApiError && (err.status >= 500 || err.status === 404 || err.status === 503)) {
        return NextResponse.json(
          { error: "Couldn't reach the bot to send a DM. Try again in a minute." },
          { status: 503 }
        )
      }
    }

    const userRes = await pool.query<{
      id: number
      username: string
      password_hash: string | null
      discord_id: string | number | null
    }>(
      `SELECT id, username, password_hash, discord_id
       FROM users
       WHERE ($1::text IS NOT NULL AND TRIM(discord_id::text) = $1)
          OR LOWER(TRIM(username)) = LOWER($2)
       ORDER BY CASE WHEN $1::text IS NOT NULL AND TRIM(discord_id::text) = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [discordId, discordUsername]
    )
    const user = userRes.rows[0]
    const hash = typeof user?.password_hash === "string" ? user.password_hash : ""
    if (!user || !hash.startsWith("$2")) {
      return NextResponse.json({ success: true, message: GENERIC_OK })
    }
    discordId = String(user.discord_id || discordId || "")
    if (!discordId) {
      return NextResponse.json({ success: true, message: GENERIC_OK })
    }

    await ensureResetTable()

    const recent = await pool.query<{ created_at: Date | string }>(
      `SELECT created_at FROM password_reset_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    )
    const last = recent.rows[0]?.created_at
    if (last && Date.now() - new Date(last).getTime() < 25_000) {
      return NextResponse.json({ success: true, message: GENERIC_OK })
    }

    const token = crypto.randomBytes(32).toString("hex")
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    )
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [user.id, hashToken(token)]
    )

    const resetUrl = `${hubOrigin()}/reset-password?token=${token}`
    try {
      await botAdminFetch("/admin/password-reset/dm", {
        method: "POST",
        body: JSON.stringify({
          discord_id: discordId,
          reset_url: resetUrl,
        }),
      })
    } catch (err) {
      console.error("[forgot-password] dm:", err)
      const msg = err instanceof BotAdminApiError ? err.message : ""
      if (/DM|DMs disabled/i.test(msg)) {
        return NextResponse.json(
          { error: "Couldn't DM that Discord. Open DMs from server members, then try again." },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: "Couldn't send the reset DM. Try again in a minute." },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, message: GENERIC_OK })
  } catch (err) {
    console.error("[auth/forgot-password] error:", err)
    return NextResponse.json(
      { error: "Couldn't send a reset link. Try again." },
      { status: 500 }
    )
  }
}
