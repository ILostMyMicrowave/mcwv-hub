import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

export type AdminRole = "member" | "officer" | "owner"

export type AdminUser = {
  id: number
  username: string
  role: AdminRole
  discordId?: string | null
}

type AdminCheck =
  | { ok: true; user: AdminUser }
  | { ok: false; response: NextResponse }

function normalizeRole(role: unknown): AdminRole {
  return role === "owner" || role === "officer" ? role : "member"
}

function canAccess(role: AdminRole, minimumRole: "officer" | "owner") {
  if (minimumRole === "owner") return role === "owner"
  return role === "owner" || role === "officer"
}

export async function getCurrentAdminUser(): Promise<AdminUser | null> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

  if (!session.user?.id) return null

  const userId = Number(session.user.id)
  if (!Number.isFinite(userId)) return null

  const result = await pool.query(
    `SELECT id, username, role
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    id: Number(row.id),
    username: String(row.username ?? ""),
    role: normalizeRole(row.role),
  }
}

export async function requireAdminUser(
  minimumRole: "officer" | "owner" = "officer"
): Promise<AdminCheck> {
  try {
    const user = await getCurrentAdminUser()

    if (!user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }

    if (!canAccess(user.role, minimumRole)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      }
    }

    return { ok: true, user }
  } catch (err) {
    console.error("[admin auth] error:", err)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to verify admin access" },
        { status: 500 }
      ),
    }
  }
}
