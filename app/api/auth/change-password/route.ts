import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"
import bcrypt from "bcryptjs"

type ChangePasswordBody = {
  currentPassword?: unknown
  newPassword?: unknown
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    )

    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as ChangePasswordBody | null

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : ""

    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : ""

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Missing password fields" },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const userRes = await pool.query(
      `
        SELECT id, password_hash
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [session.user.id]
    )

    const user = userRes.rows[0]

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    if (!user.password_hash) {
      return NextResponse.json(
        { error: "Account has no password set" },
        { status: 400 }
      )
    }

    const valid = await bcrypt.compare(
      currentPassword,
      user.password_hash
    )

    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      )
    }

    const newHash = await bcrypt.hash(newPassword, 10)

    await pool.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `,
      [newHash, session.user.id]
    )

    return NextResponse.json({ success: true })

  } catch {
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    )
  }
}
