import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import { RateLimiter } from "@/lib/rateLimit";

const limiter = new RateLimiter({ windowMs: 60_000, max: 60 });
const EVENT_RE = /^[a-z0-9 ._-]{1,40}$/i;
function clientIp(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"; }

export async function POST(req: NextRequest) {
  const rl = limiter.check(clientIp(req));
  if (!rl.success) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { "Retry-After": "60" } });
  const hdrKey = (req.headers.get("x-macro-key") ?? "").trim();
  if (!hdrKey) return NextResponse.json({ error: "nope" }, { status: 401 });
  const shared = process.env.MACRO_REPORT_KEY;
  let keyId: number | null = null;
  let verifiedMember: string | null = null;
  if (shared && hdrKey === shared) {
  } else {
    try {
      const { rows } = await pool.query(`select id, member_name, revoked_at from mcwv_macro_keys where key = $1 limit 1`, [hdrKey]);
      const row = rows[0];
      if (!row) return NextResponse.json({ error: "nope" }, { status: 401 });
      if (row.revoked_at) return NextResponse.json({ error: "revoked" }, { status: 401 });
      keyId = Number(row.id); verifiedMember = String(row.member_name ?? "");
      try { await pool.query(`update mcwv_macro_keys set last_seen = now(), runs = runs + 1 where id = $1`, [keyId]); } catch {}
    } catch (e) {
      if (!shared) {
        console.error("[macro-report] member-key lookup failed:", (e as Error).message?.slice(0, 200));
        return NextResponse.json({ error: "db unavailable" }, { status: 503 });
      }
      return NextResponse.json({ error: "nope" }, { status: 401 });
    }
    if (!keyId && shared) return NextResponse.json({ error: "nope" }, { status: 401 });
  }
  if (!keyId && shared && hdrKey !== shared) return NextResponse.json({ error: "nope" }, { status: 401 });
  if (!keyId && !shared) return NextResponse.json({ error: "nope" }, { status: 401 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const event = String(b.e ?? "").slice(0, 40);
  if (!EVENT_RE.test(event)) return NextResponse.json({ error: "bad event" }, { status: 400 });
  const r = String(b.r ?? "");
  const result = r === "ok" || r === "panic" || r === "timeout" || r === "stopped" ? r : "error";
  const s = Number(b.s);
  const seconds = Number.isFinite(s) ? Math.max(0, Math.min(3600, Math.round(s))) : 0;
  const rawMember = (String(b.m ?? "").replace(/[^\w.\- ]/g, "").trim() || "unknown").slice(0, 32);
  const member = verifiedMember ? verifiedMember.slice(0, 32) : rawMember;
  const version = (String(b.v ?? "").replace(/[^\w.+-]/g, "") || "?").slice(0, 16);
  const dry = b.d === 1 || b.d === true;
  try {
    await pool.query(`insert into mcwv_macro_reports (event, result, seconds, member, version, dry, key_id) values ($1,$2,$3,$4,$5,$6,$7)`, [event, result, seconds, member, version, dry, keyId]);
  } catch {
    try {
      await pool.query(`insert into mcwv_macro_reports (event, result, seconds, member, version, dry) values ($1,$2,$3,$4,$5,$6)`, [event, result, seconds, member, version, dry]);
    } catch (e2) {
      console.error("[macro-report] insert failed:", (e2 as Error).message?.slice(0, 200));
    }
  }
  return NextResponse.json({ ok: 1 });
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (user.role !== "officer" && user.role !== "owner") return NextResponse.json({ error: "Officers only — your macros are at /macros" }, { status: 403 });
  const hours = req.nextUrl.searchParams.get("hours");
  const h = hours === "168" ? 168 : 24;
  try {
    const { rows } = await pool.query(
      `select event, count(*)::int as runs, count(*) filter (where result = 'ok')::int as ok, count(*) filter (where result <> 'ok' and result <> 'stopped')::int as failed, count(distinct member)::int as members, round(avg(seconds) filter (where result = 'ok')::numeric, 1) as avg_s, max(created_at) as last_run, (array_agg(member) filter (where result <> 'ok'))[1:6] as failing_members from mcwv_macro_reports where created_at > now() - make_interval(hours => $1) group by event order by count(*) filter (where result <> 'ok' and result <> 'stopped') desc, event`,
      [h]
    );
    const recent = await pool.query(`select event, result, member, version, to_char(created_at, 'MM-DD HH24:MI') as at from mcwv_macro_reports where result not in ('ok','stopped') and created_at > now() - make_interval(hours => $1) order by created_at desc limit 25`, [h]);
    return NextResponse.json({ ok: 1, hours: h, events: rows, recent_failures: recent.rows });
  } catch (e) {
    console.error("[macro-report] summary db blip, returning empty:", (e as Error).message?.slice(0, 200));
    // Don't 503 the officer page — return empty so it still loads with message
    return NextResponse.json({ ok: 1, hours: h, events: [], recent_failures: [], dbDown: true, error: "Database is having a moment — try refresh in a few seconds. Your macros still work." });
  }
}
