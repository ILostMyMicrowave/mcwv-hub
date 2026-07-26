import { NextResponse } from "next/server"
import { proxyBotAdminMutation } from "@/lib/adminProxy"
import { requireBroadcastUser } from "@/lib/broadcastAccess"
import { botAdminFetch, BotAdminApiError } from "@/lib/botAdminApi"

const OFFICER_ACTIONS = new Set([
  "sync",
  "giveaway/end",
  "giveaway/create",
  "giveaway/reroll",
  "giveaway/cancel",
  "invite/start",
  "invite/end",
  "invite/pause",
  "invite/resume",
  "invite/delete",
  "player/sync",
  "player/add-alt",
])

const OWNER_ACTIONS = new Set([
  "restart",
  "player/remove",
])

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const action = path.join("/")

  if (action === "broadcast/send") {
    const broadcastAuth = await requireBroadcastUser()
    if (!broadcastAuth.ok) return broadcastAuth.response

    try {
      const body = await req.json().catch(() => ({}))
      const data = await botAdminFetch("/admin/broadcast/send", {
        method: "POST",
        body: JSON.stringify({ ...body, requested_by: broadcastAuth.user.username }),
      })
      return NextResponse.json(data)
    } catch (err) {
      if (err instanceof BotAdminApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      return NextResponse.json({ error: "Broadcast send failed" }, { status: 500 })
    }
  }

  if (OWNER_ACTIONS.has(action)) {
    return proxyBotAdminMutation(req, `/admin/${action}`, { minimumRole: "owner" })
  }

  if (OFFICER_ACTIONS.has(action)) {
    return proxyBotAdminMutation(req, `/admin/${action}`, { minimumRole: "officer" })
  }

  return NextResponse.json(
    { error: `Unknown admin action: ${action}` },
    { status: 404 }
  )
}
