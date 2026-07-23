import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"
import { logAdminAction } from "@/lib/adminAudit"

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const meRes = await pool.query(
      `SELECT id, username, role FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id]
    )

    const me = meRes.rows[0]
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (me.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const userId = Number(body.user_id)
    const nextRole = String(body.role || "")

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid user_id" }, { status: 400 })
    }

    if (!["member", "officer"].includes(nextRole)) {
      return NextResponse.json(
        { error: "Invalid role. Only member/officer can be assigned here." },
        { status: 400 }
      )
    }

    const targetRes = await pool.query(
      `SELECT id, username, role FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    )

    const target = targetRes.rows[0]
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owner role cannot be changed here" },
        { status: 400 }
      )
    }

    await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2`,
      [nextRole, userId]
    )

    await logAdminAction({
      level: "info",
      event: "Role Updated",
      message: `${me.username} changed ${target.username}'s role from ${target.role ?? "member"} to ${nextRole}`,
      action: "users/role",
      actor: {
        id: Number(me.id),
        username: String(me.username),
        role: "owner",
      },
      metadata: {
        targetUserId: target.id,
        targetUsername: target.username,
        previousRole: target.role,
        nextRole,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/users/role] POST error:", err)
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    )
  }
}
