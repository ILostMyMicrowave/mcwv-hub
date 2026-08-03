import { NextResponse } from "next/server"
import { requireBroadcastUser } from "@/lib/broadcastAccess"
import { pool } from "@/lib/db"
import {
  broadcastTablesExist,
  mapScheduleRow,
  missingTablesResponse,
  sanitizeScheduleInput,
} from "@/lib/broadcastDb"

export const dynamic = "force-dynamic"
export const revalidate = 0

const SCHEDULE_COLUMNS = `id, name, kind, audience, value, delivery, style, message,
  top_n, hours_before_end, run_at, enabled, created_by, last_fired_at, last_fired_battle`

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params
  const parsed = Number(id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()

  const id = await parseId(params)
  if (!id) return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const existing = await pool.query(
      `SELECT ${SCHEDULE_COLUMNS} FROM broadcast_schedules WHERE id = $1 LIMIT 1`,
      [id]
    )
    if (!existing.rows.length) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }

    const row = existing.rows[0] as Record<string, unknown>
    const merged = {
      name: row.name,
      kind: row.kind,
      audience: row.audience,
      value: row.value,
      delivery: row.delivery,
      style: row.style,
      message: row.message,
      topN: row.top_n,
      hoursBeforeEnd: row.hours_before_end,
      runAt: row.run_at instanceof Date ? row.run_at.toISOString() : row.run_at ? String(row.run_at) : null,
      enabled: row.enabled,
      ...body,
    }

    const alreadyFired = row.last_fired_at !== null && row.last_fired_at !== undefined
    const parsed = sanitizeScheduleInput(merged, { alreadyFired })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const s = parsed.data
    const result = await pool.query(
      `UPDATE broadcast_schedules
       SET name = $2, kind = $3, audience = $4, value = $5, delivery = $6, style = $7,
           message = $8, top_n = $9, hours_before_end = $10, run_at = $11, enabled = $12
       WHERE id = $1
       RETURNING ${SCHEDULE_COLUMNS}`,
      [
        id,
        s.name,
        s.kind,
        s.audience,
        s.value,
        s.delivery,
        s.style,
        s.message,
        s.topN,
        s.hoursBeforeEnd,
        s.runAt,
        s.enabled,
      ]
    )

    return NextResponse.json({ schedule: mapScheduleRow(result.rows[0]) })
  } catch (err) {
    console.error("[broadcast schedules] update failed:", err)
    return NextResponse.json({ error: "Failed to update broadcast schedule" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()

  const id = await parseId(params)
  if (!id) return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 })

  try {
    const result = await pool.query(`DELETE FROM broadcast_schedules WHERE id = $1 RETURNING id`, [id])
    if (!result.rows.length) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[broadcast schedules] delete failed:", err)
    return NextResponse.json({ error: "Failed to delete broadcast schedule" }, { status: 500 })
  }
}
