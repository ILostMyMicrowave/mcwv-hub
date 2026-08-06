import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  upTo: z.number().int().positive().max(9_000_000_000_000_000),
});

// Moves the member's read marker forward. GREATEST() means it can only ever
// advance — an old request can never un-read newer alerts.
export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid value." }, { status: 400 });
  }

  await ensurePushTables();
  await pool.query(
    `INSERT INTO alert_read_marker (user_id, last_read_notif_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       last_read_notif_id = GREATEST(
         alert_read_marker.last_read_notif_id,
         EXCLUDED.last_read_notif_id
       ),
       updated_at = NOW()`,
    [auth.user.id, String(parsed.data.upTo)]
  );
  return NextResponse.json({ success: true });
}
