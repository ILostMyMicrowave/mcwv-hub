import { NextResponse } from "next/server"
import { getCurrentAdminUser, type AdminUser } from "@/lib/adminAuth"

function allowedBroadcastUsernames() {
  return new Set(
    (process.env.BROADCAST_ADMIN_USERNAMES ?? "")
      .split(",")
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean)
  )
}

function allowedBroadcastUserIds() {
  return new Set(
    (process.env.BROADCAST_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  )
}

export function canUseBroadcast(user: AdminUser | null | undefined) {
  if (!user) return false
  if (user.role === "owner") return true
  if (user.role !== "officer") return false

  const usernames = allowedBroadcastUsernames()
  const userIds = allowedBroadcastUserIds()

  // If no allowlist is configured, officers can use broadcast.
  // Add BROADCAST_ADMIN_USERNAMES or BROADCAST_ADMIN_USER_IDS
  // to restrict broadcast access to specific officers.
  if (!usernames.size && !userIds.size) return true

  return usernames.has(user.username.toLowerCase()) || userIds.has(String(user.id))
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

    if (!canUseBroadcast(user)) {
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
