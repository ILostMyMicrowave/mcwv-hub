import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  if (!botAdminApiConfigured()) {
    return NextResponse.json({
      success: true,
      configured: false,
      channels: [],
      message: "Bot admin API is not configured.",
    })
  }

  try {
    const data = await botAdminFetch("/admin/channels")
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof BotAdminApiError ? err.message : "Failed to load Discord channels"
    return NextResponse.json(
      {
        success: false,
        channels: [],
        error: message,
      },
      { status: err instanceof BotAdminApiError ? err.status : 502 }
    )
  }
}
