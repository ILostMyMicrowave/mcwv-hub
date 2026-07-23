import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"
import { logAdminAction } from "@/lib/adminAudit"

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

function actionLabel(botPath: string) {
  const labels: Record<string, string> = {
    "/admin/sync": "Sync Requested",
    "/admin/restart": "Bot Restart Requested",
    "/admin/giveaway/end": "Giveaway Ended",
    "/admin/giveaway/create": "Giveaway Created",
    "/admin/giveaway/reroll": "Giveaway Rerolled",
    "/admin/giveaway/cancel": "Giveaway Cancelled",
    "/admin/invite/start": "Invite Event Created",
    "/admin/invite/end": "Invite Event Ended",
    "/admin/invite/pause": "Invite Event Paused",
    "/admin/invite/resume": "Invite Event Resumed",
    "/admin/invite/delete": "Invite Event Deleted",
    "/admin/player/sync": "Player Synced",
    "/admin/player/add-alt": "Roblox Alt Added",
    "/admin/player/remove": "Player Removed",
  }

  return labels[botPath] ?? botPath.replace(/^\/admin\//, "Admin Action: ")
}

function safeMetadata(body: Record<string, unknown>) {
  const blocked = new Set(["password", "password_hash", "token", "bot_token", "api_key", "secret"])
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !blocked.has(key.toLowerCase()))
  )
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

  const label = actionLabel(botPath)
  const action = botPath.replace(/^\/admin\/?/, "")
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const metadata = safeMetadata(body)

  try {
    const channelId = channelIdFromBody(body)

    if (CHANNEL_REQUIRED_ACTIONS.has(botPath) && !channelId) {
      const message = "A Discord channel ID or channel mention is required for this action."
      await logAdminAction({
        level: "warning",
        event: `${label} Blocked`,
        message: `${auth.user.username} attempted ${label}: ${message}`,
        action,
        actor: auth.user,
        metadata,
      })

      return NextResponse.json({ error: message }, { status: 400 })
    }

    if (botPath === "/admin/player/remove") {
      const owner = await ownerRemovalTarget(body)
      if (owner) {
        const message = `Owner account ${owner.username ?? owner.id} cannot be removed from the database or Roblox links.`
        await logAdminAction({
          level: "warning",
          event: `${label} Blocked`,
          message: `${auth.user.username} attempted ${label}: ${message}`,
          action,
          actor: auth.user,
          metadata,
        })

        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    const data = await botAdminFetch<Record<string, unknown>>(botPath, {
      method: options.method ?? "POST",
      body: JSON.stringify({ ...body, channel_id: channelId ?? body.channel_id, requested_by: auth.user.username }),
    })

    const message = typeof data?.message === "string" && data.message.trim()
      ? data.message.trim()
      : `${label} completed`

    await logAdminAction({
      level: "info",
      event: label,
      message: `${auth.user.username}: ${message}`,
      action,
      actor: auth.user,
      metadata: { ...metadata, result: data },
    })

    return NextResponse.json(data)
  } catch (err) {
    const status = err instanceof BotAdminApiError ? err.status : 500
    const message = err instanceof Error ? err.message : "Bot admin action failed"

    await logAdminAction({
      level: "error",
      event: `${label} Failed`,
      message: `${auth.user.username}: ${message}`,
      action,
      actor: auth.user,
      metadata,
    })

    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error(`[admin proxy] ${botPath} error:`, err)
    return NextResponse.json({ error: "Bot admin action failed" }, { status })
  }
}
