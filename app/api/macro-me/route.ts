import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  try {
    const { rows } = await pool.query(
      `select id, substr(key,1,8) as key_start, substr(key,length(key)-3,4) as key_end, last_seen, runs, revoked_at
         from mcwv_macro_keys where member_id = $1 and revoked_at is null order by last_seen desc nulls last, issued_at desc limit 1`,
      [user.id]
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ ok: 1, hasKey: false, user: { username: user.username, role: user.role } });
    }
    return NextResponse.json({
      ok: 1,
      hasKey: true,
      keyPreview: `${row.key_start}…${row.key_end}`,
      lastSeen: row.last_seen,
      runs: row.runs,
      user: { username: user.username, role: user.role, id: user.id },
    });
  } catch (e) {
    console.error("[macro-me] failed:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  }
}
