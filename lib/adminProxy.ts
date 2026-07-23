import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"

type ProxyOptions = {
  minimumRole?: "officer" | "owner"
  method?: "POST" | "PATCH" | "DELETE"
}

const CHANNEL_REQUIRED_ACTIONS = new Set([
  "/admin/giveaway/create",
  "/admin/invite/start",
])

function parseDiscordChannelId(value: unknown) {
  if (value === null || value === undefined) return null

  const text = String(value).trim()
  if (!text) return null

  const mentionMatch = text.match(/^<#(\d{15,25})>$/)
  if (mentionMatch) return mentionMatch[1]

  const idMatch = text.match(/^(\d{15,25})$/)
  if (idMatch) return idMatch[1]

  return null
}

function channelIdFromBody(body: Record<string, unknown>) {
  return parseDiscordChannelId(
    body.channel_id ??
      body.channelId ??
      body.channel ??
      body.discord_channel_id ??
      body.discordChannelId
  )
}

function bodyString(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key]
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim()
    }
  }

  return null
}

async function ownerRemovalTarget(body: Record<string, unknown>) {
  const discordId = bodyString(body, ["discord_id", "discordId", "discord"])
  const robloxId = bodyString(body, ["roblox_id", "robloxId"])
  const username = bodyString(body, ["username", "roblox_username", "robloxUsername"])

  if (discordId) {
    const result = await pool.query(
      `SELECT id, username
       FROM users
       WHERE role = 'owner'
         AND discord_id::text = $1
       LIMIT 1`,
      [discordId]
    )

    if (result.rows[0]) return result.rows[0]
  }

  if (robloxId) {
    const direct = await pool.query(
      `SELECT id, username
       FROM users
       WHERE role = 'owner'
         AND roblox_id::text = $1
       LIMIT 1`,
      [robloxId]
    )

    if (direct.rows[0]) return direct.rows[0]

    try {
      const alt = await pool.query(
        `SELECT u.id, u.username
         FROM user_alts a
         JOIN users u ON u.discord_id::text = a.discord_id::text
         WHERE u.role = 'owner'
           AND a.roblox_id::text = $1
         LIMIT 1`,
        [robloxId]
      )

      if (alt.rows[0]) return alt.rows[0]
    } catch {
      // user_alts may not exist in older deployments; ignore and let bot guard too.
    }
  }

  if (username) {
    const result = await pool.query(
      `SELECT id, username
       FROM users
       WHERE role = 'owner'
         AND LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    )

    if (result.rows[0]) return result.rows[0]
  }

  return null
}

export async function proxyBotAdminMutation(
  req: Request,
  botPath: string,
  options: ProxyOptions = {}
) {
  const auth = await requireAdminUser(options.minimumRole ?? "officer")
  if (!auth.ok) return auth.response

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const channelId = channelIdFromBody(body)

    if (CHANNEL_REQUIRED_ACTIONS.has(botPath) && !channelId) {
      return NextResponse.json(
        { error: "A Discord channel ID or channel mention is required for this action." },
        { status: 400 }
      )
    }

    if (botPath === "/admin/player/remove") {
      const owner = await ownerRemovalTarget(body)
      if (owner) {
        return NextResponse.json(
          {
            error: `Owner account ${owner.username ?? owner.id} cannot be removed from the database or Roblox links.`,
          },
          { status: 400 }
        )
      }
    }

    const data = await botAdminFetch(botPath, {
      method: options.method ?? "POST",
      body: JSON.stringify({ ...body, channel_id: channelId ?? body.channel_id, requested_by: auth.user.username }),
    })

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error(`[admin proxy] ${botPath} error:`, err)
    return NextResponse.json(
      { error: "Bot admin action failed" },
      { status: 500 }
    )
  }
}
