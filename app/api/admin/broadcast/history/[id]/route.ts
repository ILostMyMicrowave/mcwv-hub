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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBroadcastUser()
  if (!auth.ok) return auth.response

  if (!(await broadcastTablesExist())) return missingTablesResponse()
  const hasImage = await broadcastImageColumnsReady()

  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid send id" }, { status: 400 })
  }

  try {
    const [sendResult, recipientResult] = await Promise.all([
      pool.query(`SELECT ${sendColumns(hasImage)} FROM broadcast_sends WHERE id = $1 LIMIT 1`, [id]),
      pool.query(
        `SELECT roblox_id, discord_id, username, points_at_send, delivered, error
         FROM broadcast_recipients
         WHERE send_id = $1
         ORDER BY delivered DESC, username ASC
         LIMIT 500`,
        [id]
      ),
    ])

    if (!sendResult.rows.length) {
      return NextResponse.json({ error: "Send not found" }, { status: 404 })
    }

    return NextResponse.json({
      send: mapSendRow(sendResult.rows[0]),
      recipients: recipientResult.rows.map((row: Record<string, unknown>) => ({
        username: row.username ? String(row.username) : null,
        discordId: row.discord_id ? String(row.discord_id) : null,
        robloxId: row.roblox_id ? String(row.roblox_id) : null,
        pointsAtSend: Number(row.points_at_send ?? 0),
        delivered: Boolean(row.delivered),
        error: row.error ? String(row.error) : null,
      })),
    })
  } catch (err) {
    console.error("[broadcast history] detail failed:", err)
    return NextResponse.json({ error: "Failed to load broadcast send" }, { status: 500 })
  }
}
