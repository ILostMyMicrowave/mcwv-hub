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

export async function GET() {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()

  try {
    const result = await pool.query(
      `SELECT ${SCHEDULE_COLUMNS}
       FROM broadcast_schedules
       ORDER BY enabled DESC, id ASC
       LIMIT 100`
    )
    return NextResponse.json({ schedules: result.rows.map(mapScheduleRow) })
  } catch (err) {
    console.error("[broadcast schedules] list failed:", err)
    return NextResponse.json({ error: "Failed to load broadcast schedules" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()

  const parsed = sanitizeScheduleInput(await req.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const s = parsed.data

  try {
    const result = await pool.query(
      `INSERT INTO broadcast_schedules
         (name, kind, audience, value, delivery, style, message, top_n, hours_before_end, run_at, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SCHEDULE_COLUMNS}`,
      [
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
        auth.user.username,
      ]
    )
    return NextResponse.json({ schedule: mapScheduleRow(result.rows[0]) })
  } catch (err) {
    console.error("[broadcast schedules] create failed:", err)
    return NextResponse.json({ error: "Failed to save broadcast schedule" }, { status: 500 })
  }
}
