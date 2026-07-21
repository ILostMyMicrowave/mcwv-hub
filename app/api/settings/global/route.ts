import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

// GET remains public per spec - clan settings are public info
export async function GET() {
  try {
    const res = await pool.query(
      `SELECT discord_link, requirements_text, banner_text, banner_speed, updated_at
       FROM global_settings
       WHERE id = 1
       LIMIT 1`
    )

    const row = res.rows[0]

    return NextResponse.json({
      discord_link: row?.discord_link ?? "",
      requirements_text: row?.requirements_text ?? "",
      banner_text: row?.banner_text ?? "",
      banner_speed: row?.banner_speed ?? 18,
      updated_at: row?.updated_at ?? null,
    })
  } catch {
    return NextResponse.json(
      { error: "Failed to load global settings" },
      { status: 500 }
    )
  }
}

// POST now uses iron-session + DB role check (not trusting session.role)
export async function POST(req: Request) {
  try {
    // 1. Get verified session (iron-session decrypts and validates)
    const cookieStore = await cookies()
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Query current role from DB - safer than trusting session.user.role
    // If user was demoted, their 14-day session won't keep old privileges
    const userRes = await pool.query(
      `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id]
    )

    const currentUser = userRes.rows[0]
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 3. Authorize - only officer+ can edit global settings
    if (!["officer", "owner"].includes(currentUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const discord_link = String(body.discord_link ?? "")
    const requirements_text = String(body.requirements_text ?? "")
    const banner_text = String(body.banner_text ?? "")
    const banner_speed = Number(body.banner_speed ?? 18)

    await pool.query(
      `INSERT INTO global_settings (
        id,
        discord_link,
        requirements_text,
        banner_text,
        banner_speed,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        discord_link = EXCLUDED.discord_link,
        requirements_text = EXCLUDED.requirements_text,
        banner_text = EXCLUDED.banner_text,
        banner_speed = EXCLUDED.banner_speed,
        updated_at = NOW()`,
      [discord_link, requirements_text, banner_text, banner_speed]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[settings/global] POST error:", err)
    return NextResponse.json(
      { error: "Failed to update global settings" },
      { status: 500 }
    )
  }
}

