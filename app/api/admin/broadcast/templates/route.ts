import { NextResponse } from "next/server"
import { requireBroadcastUser } from "@/lib/broadcastAccess"
import { pool } from "@/lib/db"
import {
  broadcastTablesExist,
  ensureBroadcastImageColumns,
  isUniqueViolation,
  mapTemplateRow,
  missingTablesResponse,
  sanitizeTemplateInput,
} from "@/lib/broadcastDb"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()
  await ensureBroadcastImageColumns()

  try {
    const result = await pool.query(
      `SELECT id, name, audience, value, delivery, style, message, image_url, created_by, updated_by, updated_at
       FROM broadcast_templates
       ORDER BY name ASC
       LIMIT 200`
    )
    return NextResponse.json({ templates: result.rows.map(mapTemplateRow) })
  } catch (err) {
    console.error("[broadcast templates] list failed:", err)
    return NextResponse.json({ error: "Failed to load broadcast templates" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()
  await ensureBroadcastImageColumns()

  const parsed = sanitizeTemplateInput(await req.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { name, audience, value, delivery, style, message, imageUrl } = parsed.data

  try {
    const result = await pool.query(
      `INSERT INTO broadcast_templates (name, audience, value, delivery, style, message, image_url, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, name, audience, value, delivery, style, message, image_url, created_by, updated_by, updated_at`,
      [name, audience, value, delivery, style, message, imageUrl, auth.user.username]
    )
    return NextResponse.json({ template: mapTemplateRow(result.rows[0]) })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A template with that name already exists." }, { status: 409 })
    }
    console.error("[broadcast templates] create failed:", err)
    return NextResponse.json({ error: "Failed to save broadcast template" }, { status: 500 })
  }
}
