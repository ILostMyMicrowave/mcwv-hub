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
    "SELECT id, role, username FROM users WHERE id = $1 LIMIT 1",
    [userId]
  )

  return res.rows[0] ?? null
}

export async function GET() {
  try {
    const res = await pool.query(
      "SELECT a.id, a.title, a.placement, a.war_number, a.description, a.date, a.created_by, a.created_at, u.username AS created_by_username FROM achievements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC, a.id DESC"
    )

    return NextResponse.json({ entries: res.rows })
  } catch {
    return NextResponse.json(
      { error: "Failed to load achievements" },
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

    const title = String(body.title || "").trim()
    const placement = String(body.placement || "").trim()
    const description = String(body.description || "").trim()
    const dateRaw = String(body.date || "").trim()

    const warNumberRaw = body.war_number
    const warNumber =
      warNumberRaw === null || warNumberRaw === undefined || warNumberRaw === ""
        ? null
        : Number(warNumberRaw)

    const date = dateRaw.length > 0 ? dateRaw : null

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    if (!placement) {
      return NextResponse.json({ error: "Placement is required" }, { status: 400 })
    }

    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      )
    }

    if (warNumber !== null && !Number.isFinite(warNumber)) {
      return NextResponse.json(
        { error: "War number must be a valid number" },
        { status: 400 }
      )
    }

    const res = await pool.query(
      `INSERT INTO achievements (
    title,
    placement,
    war_number,
    description,
    date,
    created_by
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING
    id,
    title,
    placement,
    war_number,
    description,
    date,
    created_by,
    created_at`,
      [title, placement, warNumber, description, date, me.id]
    )

    return NextResponse.json({ success: true, entry: res.rows[0] })
  } catch {
    return NextResponse.json(
      { error: "Failed to add achievement" },
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
    const title = String(body.title || "").trim()
    const placement = String(body.placement || "").trim()
    const description = String(body.description || "").trim()
    const dateRaw = String(body.date || "").trim()

    const warNumberRaw = body.war_number
    const warNumber =
      warNumberRaw === null || warNumberRaw === undefined || warNumberRaw === ""
        ? null
        : Number(warNumberRaw)

    const date = dateRaw.length > 0 ? dateRaw : null

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    if (!placement) {
      return NextResponse.json({ error: "Placement is required" }, { status: 400 })
    }

    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      )
    }

    if (warNumber !== null && !Number.isFinite(warNumber)) {
      return NextResponse.json(
        { error: "War number must be a valid number" },
        { status: 400 }
      )
    }

    const existing = await pool.query(
      `SELECT id FROM achievements WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    }

    const res = await pool.query(
      `UPDATE achievements
   SET title = $1,
       placement = $2,
       war_number = $3,
       description = $4,
       date = $5
   WHERE id = $6
   RETURNING
     id,
     title,
     placement,
     war_number,
     description,
     date,
     created_by,
     created_at`,
      [title, placement, warNumber, description, date, id]
    )

    return NextResponse.json({ success: true, entry: res.rows[0] })
  } catch {
    return NextResponse.json(
      { error: "Failed to update achievement" },
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
      `SELECT id FROM achievements WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    }

    await pool.query(`DELETE FROM achievements WHERE id = $1`, [id])

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to delete achievement" },
      { status: 500 }
    )
  }
}
