import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "@/lib/session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { getAuthenticatedUser } from "@/lib/authUser"
import { pool } from "@/lib/db"

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ user: null })
    }
    // Try to enrich with theme/sid from DB, but don't block on failure
    try {
      const cookieStore = await cookies()
      const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
      // If cache already gave us full data, try to get theme in background, but serve now
      // For speed, only query theme if we have time — otherwise return what we have
      const result = await pool.query(
        `SELECT theme FROM users WHERE id = $1 LIMIT 1`,
        [user.id]
      )
      const theme = result.rows[0]?.theme ?? null
      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          roblox_id: user.robloxId,
          discord_id: user.discordId,
          theme,
          sid: session.user?.sid ?? null,
        },
      })
    } catch {
      // DB blip — serve what getAuthenticatedUser already gave (session or stale cache)
      const cookieStore = await cookies()
      const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          roblox_id: user.robloxId,
          discord_id: user.discordId,
          theme: null,
          sid: session.user?.sid ?? null,
        },
      })
    }
  } catch {
    try {
      const cookieStore = await cookies()
      const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
      const u = session?.user
      return NextResponse.json({
        user: u ? { id: u.id, username: u.username, role: u.role ?? null, sid: u.sid ?? null } : null,
      })
    } catch {
      return NextResponse.json({ user: null })
    }
  }
}
