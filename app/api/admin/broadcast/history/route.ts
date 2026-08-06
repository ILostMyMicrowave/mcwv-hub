import { NextResponse } from "next/server"
import { requireBroadcastUser } from "@/lib/broadcastAccess"
import { pool } from "@/lib/db"
import {
  broadcastImageColumnsReady,
  broadcastTablesExist,
  mapSendRow,
  missingTablesResponse,
} from "@/lib/broadcastDb"

export const dynamic = "force-dynamic"
export const revalidate = 0

function sendColumns(hasImage: boolean) {
  return `id, actor, source, template_id, audience, value, delivery, style, message,
  battle_key, matched_count, sent_count, failed_count, status, sent_at,
  conversion_checked_at, conversion_zero_at_send, conversion_scorers, conversion_points${
    hasImage ? ", image_url" : ""
  }`
}

export async function GET(req: Request) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()
  const hasImage = await broadcastImageColumnsReady()

  const url = new URL(req.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "25")
  const offsetParam = Number(url.searchParams.get("offset") ?? "0")
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 50) : 25
  const offset = Number.isFinite(offsetParam) ? Math.max(Math.trunc(offsetParam), 0) : 0
  const wantStats = url.searchParams.get("stats") === "1"

  try {
    const [rows, count, stats] = await Promise.all([
      pool.query(
        `SELECT ${sendColumns(hasImage)}
         FROM broadcast_sends
         ORDER BY sent_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM broadcast_sends`),
      wantStats
        ? pool.query(
            `SELECT
               COUNT(*)::int AS sends,
               COALESCE(SUM(sent_count), 0)::int AS delivered,
               COALESCE(SUM(conversion_scorers), 0)::int AS conversions,
               COALESCE(SUM(conversion_points), 0)::bigint AS points_gained,
               COUNT(*) FILTER (WHERE conversion_checked_at IS NULL)::int AS pending
             FROM broadcast_sends
             WHERE sent_at >= NOW() - INTERVAL '30 days'`
          )
        : Promise.resolve(null),
    ])

    const statsRow = stats?.rows?.[0] as Record<string, unknown> | undefined

    return NextResponse.json({
      sends: rows.rows.map(mapSendRow),
      total: Number(count.rows[0]?.total ?? 0),
      stats: statsRow
        ? {
            sends: Number(statsRow.sends ?? 0),
            delivered: Number(statsRow.delivered ?? 0),
            conversions: Number(statsRow.conversions ?? 0),
            pointsGained: Number(statsRow.points_gained ?? 0),
            pending: Number(statsRow.pending ?? 0),
          }
        : null,
    })
  } catch (err) {
    console.error("[broadcast history] list failed:", err)
    return NextResponse.json({ error: "Failed to load broadcast history" }, { status: 500 })
  }
}
