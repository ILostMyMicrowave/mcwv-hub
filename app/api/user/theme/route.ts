import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

    if (!session.user?.id) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    }

    const userId = session.user.id
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const theme = typeof body.theme === "string" ? body.theme.trim() : ""

    if (!theme) {
      return NextResponse.json({ error: "Missing theme" }, { status: 400 })
    }

    await pool.query(
      "UPDATE users SET theme = $1 WHERE id = $2",
      [theme, userId]
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to save theme" }, { status: 500 })
  }
}

