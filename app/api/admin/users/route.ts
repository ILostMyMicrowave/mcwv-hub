import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

export async function GET() {
  try {
    // 1. Verify session
    const cookieStore = await cookies()
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Query current role from DB (don't trust session.role for admin check)
    const meRes = await pool.query(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id]
    )

    const myRole = meRes.rows[0]?.role ?? "member"
    if (myRole !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 3. List users sorted by role then username
    const res = await pool.query(
      `SELECT id, username, discord_id, role
       FROM users
       ORDER BY
         CASE role
           WHEN 'owner' THEN 0
           WHEN 'officer' THEN 1
           ELSE 2
         END,
         username ASC`
    )

    return NextResponse.json({ users: res.rows })
  } catch (err) {
    console.error("[admin/users] GET error:", err)
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 }
    )
  }
}
