import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"
import { z } from "zod"

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

const achievementCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  placement: z.string().trim().min(1, "Placement is required").max(100),
  description: z.string().trim().min(1, "Description is required").max(5000),
  date: z.string().trim().nullable().optional(),
  war_number: z.coerce.number().finite().nullable().optional(),
})

const achievementUpdateSchema = z.object({
  id: z.coerce.number().finite("Invalid id"),
  title: z.string().trim().min(1, "Title is required").max(200),
  placement: z.string().trim().min(1, "Placement is required").max(100),
  description: z.string().trim().min(1, "Description is required").max(5000),
  date: z.string().trim().nullable().optional(),
  war_number: z.coerce.number().finite().nullable().optional(),
})

export async function GET() {
  try {
    const res = await pool.query(
      "SELECT a.id, a.title, a.placement, a.war_number, a.description, a.date, a.created_by, a.created_at, u.username AS created_by_username FROM achievements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC, a.id DESC"
    )

    return NextResponse.json({ entries: res.rows })
  } catch (err) {
    console.error("[achievements] GET error:", err)
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
        : warNumberRaw

    const date = dateRaw.length > 0 ? dateRaw : null

    const parsed = achievementCreateSchema.safeParse({
      title,
      placement,
      description,
      date,
      war_number: warNumber,
    })

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
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
      [
        parsed.data.title,
        parsed.data.placement,
        parsed.data.war_number,
        parsed.data.description,
        parsed.data.date,
        me.id,
      ]
    )

    return NextResponse.json({ success: true, entry: res.rows[0] })
  } catch (err) {
    console.error("[achievements] POST error:", err)
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

    const id = body.id
    const title = String(body.title || "").trim()
    const placement = String(body.placement || "").trim()
    const description = String(body.description || "").trim()
    const dateRaw = String(body.date || "").trim()

    const warNumberRaw = body.war_number
    const warNumber =
      warNumberRaw === null || warNumberRaw === undefined || warNumberRaw === ""
        ? null
        : warNumberRaw

    const date = dateRaw.length > 0 ? dateRaw : null

    const parsed = achievementUpdateSchema.safeParse({
      id,
      title,
      placement,
      description,
      date,
      war_number: warNumber,
    })

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const existing = await pool.query(
      `SELECT id FROM achievements WHERE id = $1 LIMIT 1`,
      [parsed.data.id]
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
      [
        parsed.data.title,
        parsed.data.placement,
        parsed.data.war_number,
        parsed.data.description,
        parsed.data.date,
        parsed.data.id,
      ]
    )

    return NextResponse.json({ success: true, entry: res.rows[0] })
  } catch (err) {
    console.error("[achievements] PATCH error:", err)
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
  } catch (err) {
    console.error("[achievements] DELETE error:", err)
    return NextResponse.json(
      { error: "Failed to delete achievement" },
      { status: 500 }
    )
  }
}
