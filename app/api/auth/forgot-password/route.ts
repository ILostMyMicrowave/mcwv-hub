import { NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminApiConfigured, botAdminFetch } from "@/lib/botAdminApi"
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
  "If that Discord is linked to a Hub login, MCWV-BOT will DM you a reset link. Give it up to a minute."

function hubOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.MCWV_HUB_URL?.trim() ||
    process.env.HUB_URL?.trim() ||
    "https://mcwv-hub.vercel.app"
  ).replace(/\/$/, "")
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

async function ensureResetTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(
    `ALTER TABLE password_reset_tokens ALTER COLUMN user_id DROP NOT NULL`
  ).catch(() => {})
  await pool.query(
    `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id, created_at DESC)`
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_outbox (
      id BIGSERIAL PRIMARY KEY,
      discord_username TEXT NOT NULL,
      discord_id TEXT,
      user_id INTEGER,
      token_hash TEXT NOT NULL,
      reset_url TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
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

    await ensureResetTables()

    let discordId: string | null = null
    if (botAdminApiConfigured()) {
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
        console.error("[forgot-password] lookup skipped:", err)
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
    const userOk = Boolean(user && hash.startsWith("$2"))
    if (userOk && user?.discord_id) {
      discordId = String(user.discord_id)
    }

    const token = crypto.randomBytes(32).toString("hex")
    const tokenHash = hashToken(token)
    const resetUrl = `${hubOrigin()}/reset-password?token=${token}`

    if (userOk && user) {
      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      )
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
        [user.id, tokenHash]
      )
    } else {
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES (NULL, $1, NOW() + INTERVAL '30 minutes')`,
        [tokenHash]
      )
    }

    await pool.query(
      `INSERT INTO password_reset_outbox
         (discord_username, discord_id, user_id, token_hash, reset_url, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 minutes')`,
      [
        discordUsername,
        discordId,
        userOk && user ? user.id : null,
        tokenHash,
        resetUrl,
      ]
    )

    if (userOk && discordId && botAdminApiConfigured()) {
      try {
        await botAdminFetch("/admin/password-reset/dm", {
          method: "POST",
          body: JSON.stringify({
            discord_id: discordId,
            reset_url: resetUrl,
          }),
        })
        await pool.query(
          `UPDATE password_reset_outbox SET sent_at = NOW()
           WHERE token_hash = $1 AND sent_at IS NULL`,
          [tokenHash]
        )
      } catch (err) {
        console.error("[forgot-password] live DM failed, bot loop will retry:", err)
        if (err instanceof BotAdminApiError) {
          /* queued */
        }
      }
    }

    return NextResponse.json({ success: true, message: GENERIC_OK })
  } catch (err) {
    console.error("[auth/forgot-password] error:", err)
    return NextResponse.json({ success: true, message: GENERIC_OK })
  }
}
