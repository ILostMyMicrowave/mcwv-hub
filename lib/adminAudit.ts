import { pool } from "@/lib/db"
import type { AdminUser } from "@/lib/adminAuth"

type LogLevel = "info" | "warning" | "error"

type LogAdminActionInput = {
  level?: LogLevel
  event: string
  message: string
  action?: string
  actor?: AdminUser | null
  metadata?: Record<string, unknown>
}

let tableReady: Promise<void> | null = null

function jsonSafe(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function ensureAdminLogsTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_logs (
          id BIGSERIAL PRIMARY KEY,
          level TEXT NOT NULL DEFAULT 'info',
          event TEXT NOT NULL,
          message TEXT NOT NULL DEFAULT '',
          action TEXT,
          actor_user_id INTEGER,
          actor_username TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)

      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'info'`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT 'Hub Event'`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS action TEXT`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS actor_user_id INTEGER`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS actor_username TEXT`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`)
      await pool.query(`ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
      await pool.query(`CREATE INDEX IF NOT EXISTS admin_logs_created_at_idx ON admin_logs (created_at DESC)`)
      await pool.query(`CREATE INDEX IF NOT EXISTS admin_logs_actor_username_idx ON admin_logs (actor_username)`)
      await pool.query(`CREATE INDEX IF NOT EXISTS admin_logs_action_idx ON admin_logs (action)`)
    })()
  }

  return tableReady
}

export async function logAdminAction(input: LogAdminActionInput) {
  try {
    await ensureAdminLogsTable()

    await pool.query(
      `INSERT INTO admin_logs (
        level,
        event,
        message,
        action,
        actor_user_id,
        actor_username,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.level ?? "info",
        input.event,
        input.message,
        input.action ?? null,
        input.actor?.id ?? null,
        input.actor?.username ?? null,
        JSON.stringify(jsonSafe(input.metadata)),
      ]
    )
  } catch (err) {
    console.error("[admin audit] failed to log action:", err)
  }
}

export async function getAdminLogs(limit = 500) {
  await ensureAdminLogsTable()

  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)))
  const result = await pool.query(
    `SELECT id::text,
            COALESCE(level, 'info') AS level,
            COALESCE(event, 'Hub Event') AS event,
            COALESCE(message, '') AS message,
            action,
            actor_user_id,
            actor_username,
            metadata,
            created_at
     FROM admin_logs
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    [safeLimit]
  )

  return result.rows.map((row) => ({
    id: String(row.id),
    level: String(row.level ?? "info"),
    event: String(row.event ?? "Hub Event"),
    message: String(row.message ?? ""),
    action: row.action ? String(row.action) : null,
    actorUserId: row.actor_user_id ?? null,
    actorUsername: row.actor_username ? String(row.actor_username) : null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }))
}
