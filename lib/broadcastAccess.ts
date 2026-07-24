import { NextResponse } from "next/server"
import { getCurrentAdminUser, type AdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

async function botAllowsBroadcast(discordId: string) {
  if (!botAdminApiConfigured()) return false

  try {
    const data = await botAdminFetch<{ allowed?: boolean }>("/admin/broadcast/access", {
      method: "POST",
      body: JSON.stringify({ discord_id: discordId }),
    })

    return data.allowed === true
  } catch (err) {
    if (!(err instanceof BotAdminApiError)) {
      console.error("[broadcast access] bot check failed:", err)
    }
    return false
  }
}

export async function canUseBroadcast(user: AdminUser | null | undefined) {
  if (!user?.discordId) return false
  return botAllowsBroadcast(user.discordId)
}

export async function requireBroadcastUser() {
  try {
    const user = await getCurrentAdminUser()

    if (!user) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }

    const allowed = await canUseBroadcast(user)

    if (!allowed) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "You do not have permission to use broadcasts." },
          { status: 403 }
        ),
      }
    }

    return { ok: true as const, user }
  } catch (err) {
    console.error("[broadcast access] error:", err)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Failed to verify broadcast access" },
        { status: 500 }
      ),
    }
  }
}
