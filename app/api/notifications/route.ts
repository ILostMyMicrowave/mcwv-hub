import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  image_url: string | null;
  created_at: Date | string;
};

function mapRow(row: Row) {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    imageUrl: row.image_url,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

// The inbox: clan-wide alerts + this member's personal ones, with unread
// tracking via their read marker.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await ensurePushTables();

  // User notch pref for war/placement notifications (default off)
  await pool.query(`CREATE TABLE IF NOT EXISTS user_notif_prefs (user_id BIGINT NOT NULL, type TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, type))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user_type ON user_notif_prefs(user_id, type)`);
  const [{ rows }, marker, prefRow] = await Promise.all([
    pool.query<Row>(
      `SELECT id::text AS id, type, title, body, url, image_url, created_at
       FROM notifications
       WHERE audience <> 'user' OR user_id = $1
       ORDER BY id DESC
       LIMIT 50`,
      [auth.user.id]
    ),
    pool.query<{ last_read_notif_id: string }>(
      `SELECT last_read_notif_id::text AS last_read_notif_id
       FROM alert_read_marker
       WHERE user_id = $1
       LIMIT 1`,
      [auth.user.id]
    ),
    pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM user_notif_prefs WHERE user_id = $1 AND type = 'war' LIMIT 1`,
      [auth.user.id]
    ),
  ]);

  const warEnabled = prefRow.rows[0]?.enabled === true;
  const lastReadId = Number(marker.rows[0]?.last_read_notif_id ?? "0") || 0;
  let notifications = rows.map(mapRow);
  if (!warEnabled) {
    notifications = notifications.filter((n) => n.type !== "war");
  }
  const unreadCount = notifications.filter((n) => n.id > lastReadId).length;

  return NextResponse.json({
    success: true,
    notifications,
    lastReadId,
    unreadCount,
    officer: auth.user.role === "officer" || auth.user.role === "owner",
  });
}
