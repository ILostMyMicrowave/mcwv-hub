import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/pushServer";
import { swrCached } from "@/lib/swrCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// War-day resilience: ride out pooler episodes (up to 60s) instead of
// being killed at the default cap (the Sep 16 hard failures).
export const maxDuration = 60;


// Featherweight badge endpoint for the navbar bell — one COUNT, no rows.
//
// Round 7: per-user 10s micro-cache with single-flight. The navbar polls this
// continuously (and some clients double-fire it), so the COUNT ran far more
// often than the number could change. 10s staleness on a badge is invisible;
// the auth gate still runs on every request.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await ensurePushTables();

  const { unread } = await swrCached(
    `unread-count:${auth.user.id}`,
    10_000,
    120_000,
    async () => {
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
      return { unread: Number(rows[0]?.unread ?? "0") || 0 };
    }
  );

  return NextResponse.json({
    success: true,
    unread,
  });
}
