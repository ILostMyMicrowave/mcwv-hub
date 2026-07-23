import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function hubLogs() {
  const table = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.admin_logs') IS NOT NULL AS exists`
  )

  if (!table.rows[0]?.exists) return []

  const result = await pool.query(
    `SELECT id::text,
            COALESCE(level, 'info') AS level,
            COALESCE(event, 'Hub Event') AS event,
            COALESCE(message, '') AS message,
            created_at
     FROM admin_logs
     ORDER BY created_at DESC
     LIMIT 200`
  )

  return result.rows.map((row) => ({
    id: String(row.id),
    level: String(row.level),
    event: String(row.event),
    message: String(row.message),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }))
}

export async function GET() {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  if (botAdminApiConfigured()) {
    try {
      const data = await botAdminFetch("/admin/logs")
      return NextResponse.json(data)
    } catch (err) {
      if (!(err instanceof BotAdminApiError)) {
        console.error("[api/admin/logs] bot proxy error:", err)
      }
    }
  }

  try {
    return NextResponse.json({
      success: true,
      source: "hub-db",
      logs: await hubLogs(),
    })
  } catch (err) {
    console.error("[api/admin/logs] error:", err)
    return NextResponse.json({ success: true, source: "fallback", logs: [] })
  }
}
