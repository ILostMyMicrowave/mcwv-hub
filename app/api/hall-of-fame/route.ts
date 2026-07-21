import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

export const dynamic = "force-dynamic"

type CurrentUser = {
  id: number
  role: "member" | "officer" | "owner"
  username: string
} | null

async function getCurrentUser(): Promise<CurrentUser> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

  if (!session.user?.id) return null

  const userId = session.user.id
  if (!Number.isFinite(userId)) return null

  const res = await pool.query(
    `SELECT id, role, username
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  )

  return res.rows[0] ?? null
}

export async function GET() {
  try {
    const res = await pool.query(
      `SELECT
         h.id,
         h.name,
         h.reason,
         h.image_url,
         h.created_at,
         h.created_by,
         u.username AS created_by_username
       FROM hall_of_fame h
       LEFT JOIN users u ON u.id = h.created_by
       ORDER BY h.created_at DESC, h.id DESC`
    )

    return NextResponse.json({ entries: res.rows })
  } catch {
    return NextResponse.json(
      { error: "Failed to load hall of fame entries" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser()

    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (me.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const name = String(body.name || "").trim()
    const reason = String(body.reason || "").trim()
    const imageUrlRaw = String(body.image_url || "").trim()
    const imageUrl = imageUrlRaw.length > 0 ? imageUrlRaw : null

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (!reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 })
    }

    const res = await pool.query(
      `INSERT INTO hall_of_fame (name, reason, image_url, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, reason, image_url, created_at, created_by`,
      [name, reason, imageUrl, me.id]
    )

    return NextResponse.json({ success: true, entry: res.rows[0] })
  } catch {
    return NextResponse.json(
      { error: "Failed to add hall of fame entry" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const me = await getCurrentUser()

    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (me.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const id = Number(body.id)
    const name = String(body.name || "").trim()
    const reason = String(body.reason || "").trim()
    const imageUrlRaw = String(body.image_url || "").trim()
    const imageUrl = imageUrlRaw.length > 0 ? imageUrlRaw : null

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (!reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 })
    }

    const existing = await pool.query(
      `SELECT id FROM hall_of_fame WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    }

    const res = await pool.query(
      `UPDATE hall_of_fame
       SET name = $1,
           reason = $2,
           image_url = $3
       WHERE id = $4
       RETURNING id, name, reason, image_url, created_at, created_by`,
      [name, reason, imageUrl, id]
    )

    return NextResponse.json({ success: true, entry: res.rows[0] })
  } catch {
    return NextResponse.json(
      { error: "Failed to update hall of fame entry" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const me = await getCurrentUser()

    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (me.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = new URL(req.url)
    const id = Number(url.searchParams.get("id"))

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const existing = await pool.query(
      `SELECT id FROM hall_of_fame WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    }

    await pool.query(`DELETE FROM hall_of_fame WHERE id = $1`, [id])

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to delete hall of fame entry" },
      { status: 500 }
    )
  }
}

