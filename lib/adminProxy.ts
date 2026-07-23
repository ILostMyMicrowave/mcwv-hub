import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
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
