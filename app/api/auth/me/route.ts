import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

export async function GET() {
  try {
    const cookieStore = await cookies()

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    )

    if (!session.user?.id) {
      return NextResponse.json({ user: null })
    }

    const result = await pool.query(
      `
        SELECT id, username, roblox_id, discord_id, role, theme
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [session.user.id]
    )

    const user = result.rows[0] ?? null

    return NextResponse.json({ user })
  } catch {
    // DB blip (pooler saturation, cold connect timeout): a 500 here reads as
    // "logged out" to every page and the whole site flickers. The signed
    // session already carries id/username/role — serve that (possibly stale)
    // instead. Full fields (roblox_id, discord_id, theme) need the DB and
    // come back on the next healthy poll.
    try {
      const cookieStore = await cookies()
      const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
      const u = session?.user
      return NextResponse.json({
        user: u ? { id: u.id, username: u.username, role: u.role ?? null } : null,
      })
    } catch {
      return NextResponse.json({ user: null }, { status: 500 })
    }
  }
}
