import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  const { ticketId } = await params

  try {
    const data = await botAdminFetch(`/admin/tickets/${encodeURIComponent(ticketId)}`, { method: "GET" })
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Failed to load ticket" }, { status: 500 })
  }
}
