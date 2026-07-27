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
    if (!me || me.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const userId = Number(body.user_id)

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid user_id" }, { status: 400 })
    }

    if (userId === Number(me.id)) {
      return NextResponse.json(
        { error: "You cannot delete your own website login." },
        { status: 400 }
      )
    }

    const targetRes = await pool.query(
      `SELECT id, username, role, password_hash, roblox_id, discord_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    )

    const target = targetRes.rows[0]
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owner website accounts cannot be deleted here." },
        { status: 400 }
      )
    }

    if (!target.password_hash) {
      return NextResponse.json({ success: true, message: "That user has no website login to delete." })
    }

    await pool.query(
      `UPDATE users
       SET password_hash = NULL
       WHERE id = $1`,
      [userId]
    )

    await logAdminAction({
      level: "warning",
      event: "Website Account Deleted",
      message: `${me.username} deleted ${target.username}'s Hub login without unlinking their Roblox/Discord data.`,
      action: "users/delete-account",
      actor: {
        id: Number(me.id),
        username: String(me.username),
        role: "owner",
      },
      metadata: {
        targetUserId: target.id,
        targetUsername: target.username,
        robloxId: target.roblox_id,
        discordId: target.discord_id,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Website login deleted. Roblox and Discord links were kept.",
    })
  } catch (err) {
    console.error("[admin/users/delete-account] POST error:", err)
    return NextResponse.json(
      { error: "Failed to delete website account" },
      { status: 500 }
    )
  }
}
