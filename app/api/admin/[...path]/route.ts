import { NextResponse } from "next/server"
import { proxyBotAdminMutation } from "@/lib/adminProxy"

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
