import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Featherweight badge endpoint for the navbar bell — one COUNT, no rows.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await ensurePushTables();
  const { rows } = await pool.query<{ unread: string }>(
    `SELECT COUNT(*)::text AS unread
     FROM notifications n
     WHERE (n.audience <> 'user' OR n.user_id = $1)
       AND n.id > COALESCE(
         (SELECT last_read_notif_id FROM alert_read_marker WHERE user_id = $1),
         0
       )`,
    [auth.user.id]
  );

  return NextResponse.json({
    success: true,
    unread: Number(rows[0]?.unread ?? "0") || 0,
  });
}
