import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;
import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { withDeadline } from "@/lib/deadline";

/*
 * One JOIN tap from a member on /servers. Deliberately the dumbest route in
 * the repo: fire-and-forget from the client (fetch keepalive, response
 * ignored), one idempotent-ish insert with a 60s burst-dedupe, and the whole
 * thing capped at 4s so a pooler storm can never pile up hung writes behind
 * the join the member actually cares about. If the tap is lost, nothing is
 * lost — the link still opens; worst case one pfp is missing from the
 * "around now" row.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const serverId = Number(body?.id);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const raced = await withDeadline(tap(serverId), 4_000);
  if (raced.ok) return NextResponse.json(raced.value);
  // timeout OR error: silent success shape — never feedback, never a retry storm
  return NextResponse.json({ ok: true, counted: false });
}

async function tap(serverId: number): Promise<{ ok: true; counted: boolean }> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: true, counted: false };

  const r = await pool.query(
    `INSERT INTO mcwv_privserver_taps (server_id, user_id)
     SELECT $1, $2
     WHERE EXISTS (SELECT 1 FROM mcwv_privservers s WHERE s.id = $1 AND s.status = 'live')
       AND NOT EXISTS (
         SELECT 1 FROM mcwv_privserver_taps t
         WHERE t.server_id = $1 AND t.user_id = $2
           AND t.tapped_at > now() - interval '60 seconds'
       )
     RETURNING id`,
    [serverId, user.id]
  );
  return { ok: true, counted: r.rows.length > 0 };
}
