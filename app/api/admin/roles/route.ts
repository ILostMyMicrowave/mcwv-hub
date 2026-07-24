import { NextResponse } from "next/server"
import { requireBroadcastUser } from "@/lib/broadcastAccess"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!botAdminApiConfigured()) {
    return NextResponse.json({ success: true, configured: false, roles: [] })
  }

  try {
    const data = await botAdminFetch("/admin/roles")
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        roles: [],
        error: err instanceof BotAdminApiError ? err.message : "Failed to load Discord roles",
      },
      { status: err instanceof BotAdminApiError ? err.status : 502 }
    )
  }
}
