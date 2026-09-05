import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  try {
    const { rows } = await pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM user_notif_prefs WHERE user_id = $1 AND type = 'war' LIMIT 1`,
      [auth.user.id]
    );
    return NextResponse.json({ enabled: rows[0]?.enabled === true });
  } catch (e) {
    return NextResponse.json({ enabled: false });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  try {
    const { type, enabled } = await req.json();
    if (!type) return NextResponse.json({ success: false, error: "type required" }, { status: 400 });
    await pool.query(
      `INSERT INTO user_notif_prefs (user_id, type, enabled, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id, type) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [auth.user.id, type, !!enabled]);
    return NextResponse.json({ success: true, enabled: !!enabled });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
