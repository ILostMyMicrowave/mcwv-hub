import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  if (botAdminApiConfigured()) {
    try {
      const data = await botAdminFetch("/admin/invites")
      return NextResponse.json(data)
    } catch (err) {
      if (!(err instanceof BotAdminApiError)) {
        console.error("[api/admin/invites] bot proxy error:", err)
      }
    }
  }

  return NextResponse.json({
    success: true,
    source: "hub-fallback",
    events: [],
    active: null,
    leaderboard: [],
    invitedMembers: [],
    fakeInvitesRemoved: 0,
    message: "Connect BOT_ADMIN_API_URL and BOT_ADMIN_API_KEY to manage invite events.",
  })
}

