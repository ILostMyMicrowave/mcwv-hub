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

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params
  const parsed = Number(id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()
  await ensureBroadcastImageColumns()

  const id = await parseId(params)
  if (!id) return NextResponse.json({ error: "Invalid template id" }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const existing = await pool.query(
      `SELECT id, name, audience, value, delivery, style, message, image_url
       FROM broadcast_templates WHERE id = $1 LIMIT 1`,
      [id]
    )
    if (!existing.rows.length) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const merged = { ...existing.rows[0], ...body, id: undefined }
    const parsed = sanitizeTemplateInput(merged)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { name, audience, value, delivery, style, message, imageUrl } = parsed.data
    const result = await pool.query(
      `UPDATE broadcast_templates
       SET name = $2, audience = $3, value = $4, delivery = $5, style = $6,
           message = $7, image_url = $8, updated_by = $9, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, audience, value, delivery, style, message, image_url, created_by, updated_by, updated_at`,
      [id, name, audience, value, delivery, style, message, imageUrl, auth.user.username]
    )

    return NextResponse.json({ template: mapTemplateRow(result.rows[0]) })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A template with that name already exists." }, { status: 409 })
    }
    console.error("[broadcast templates] update failed:", err)
    return NextResponse.json({ error: "Failed to update broadcast template" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()

  const id = await parseId(params)
  if (!id) return NextResponse.json({ error: "Invalid template id" }, { status: 400 })

  try {
    const result = await pool.query(`DELETE FROM broadcast_templates WHERE id = $1 RETURNING id`, [id])
    if (!result.rows.length) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[broadcast templates] delete failed:", err)
    return NextResponse.json({ error: "Failed to delete broadcast template" }, { status: 500 })
  }
}
