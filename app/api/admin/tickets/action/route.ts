import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? "")
    const ticketId = String(body.ticketId ?? body.ticket_id ?? "")
    const reason = String(body.reason ?? "")

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 })
    }

    if (action === "accept") {
      const data = await botAdminFetch("/admin/tickets/accept", {
        method: "POST",
        body: JSON.stringify({ ticket_id: ticketId, actor_id: auth.user.discordId ?? auth.user.id }),
      })
      return NextResponse.json(data)
    }

    if (action === "close") {
      const data = await botAdminFetch("/admin/tickets/close", {
        method: "POST",
        body: JSON.stringify({ ticket_id: ticketId, actor_id: auth.user.discordId ?? auth.user.id, reason: reason || "Closed from Hub" }),
      })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: "Unknown ticket action" }, { status: 400 })
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Ticket action failed" }, { status: 500 })
  }
}
