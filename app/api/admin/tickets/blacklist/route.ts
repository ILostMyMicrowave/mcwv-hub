import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  try {
    const data = await botAdminFetch("/admin/tickets/blacklist", { method: "GET" })
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Failed to load ticket blacklist" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? "add")
    const discordId = String(body.discordId ?? body.discord_id ?? body.userId ?? body.user_id ?? "").trim()
    const reason = String(body.reason ?? "No reason provided").trim()

    if (!discordId || !/^\d{15,25}$/.test(discordId)) {
      return NextResponse.json({ error: "A valid Discord user ID is required" }, { status: 400 })
    }

    const data = await botAdminFetch("/admin/tickets/blacklist", {
      method: "POST",
      body: JSON.stringify({
        action,
        discord_id: discordId,
        reason,
        actor_id: auth.user.discordId ?? auth.user.id,
      }),
    })
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Failed to update ticket blacklist" }, { status: 500 })
  }
}
