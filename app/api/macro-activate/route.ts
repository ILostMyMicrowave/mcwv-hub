import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { RateLimiter } from "@/lib/rateLimit";

const limiter = new RateLimiter({ windowMs: 60_000, max: 60 });
const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function sanitize(s: string, max: number, allow: RegExp): string {
  return String(s ?? "").replace(allow, "").trim().slice(0, max) || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = limiter.check(ip);
  if (!rl.success) return NextResponse.json({ ok: 0, reason: "slow down" }, { status: 429, headers: { "Retry-After": "60" } });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: 0, reason: "bad json" }, { status: 400 }); }

  const rawKey = String(b.k ?? "").trim();
  if (!KEY_RE.test(rawKey)) return NextResponse.json({ ok: 0, reason: "invalid" }, { status: 401 });

  const member = sanitize(String(b.m ?? ""), 32, /[^\w.\- ]/g);
  const version = sanitize(String(b.v ?? ""), 16, /[^\w.+-]/g);
  const pc = sanitize(String(b.pc ?? ""), 64, /[^\w.\- ]/g);
  const fp = sanitize(String(b.fp ?? ""), 128, /[^\w.\-_=+]/g);

  try {
    const { rows } = await pool.query(
      `select id, member_name, revoked_at from mcwv_macro_keys where key = $1 limit 1`,
      [rawKey]
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ ok: 0, reason: "invalid" }, { status: 401 });
    if (row.revoked_at) return NextResponse.json({ ok: 0, reason: "revoked" }, { status: 401 });

    try {
      await pool.query(
        `update mcwv_macro_keys
            set last_seen = now(),
                last_ip = $2,
                last_pc = $3,
                last_fp = $4,
                runs = runs + 1,
                seen_ips = array(select distinct unnest(array_append(seen_ips, $2)) order by 1),
                seen_pcs = array(select distinct unnest(array_append(seen_pcs, $3)) order by 1)
          where id = $1`,
        [row.id, ip, pc, fp]
      );
    } catch (e) {
      console.error("[macro-activate] update failed:", (e as Error).message?.slice(0, 200));
    }

    try {
      await pool.query(
        `insert into mcwv_macro_activations (key_id, ip, pc, fp, version, member) values ($1,$2,$3,$4,$5,$6)`,
        [row.id, ip, pc, fp, version, member]
      );
    } catch (e) {
      console.error("[macro-activate] activation log failed:", (e as Error).message?.slice(0, 200));
    }

    let sharing = false;
    try {
      const { rows: ipRows } = await pool.query(
        `select count(distinct ip)::int as c from mcwv_macro_activations where key_id = $1 and created_at > now() - interval '24 hours'`,
        [row.id]
      );
      sharing = (ipRows[0]?.c ?? 1) > 2;
    } catch { /* ignore */ }

    return NextResponse.json({
      ok: 1,
      member: row.member_name,
      sharing: sharing || undefined,
      grace_days: 3,
    });
  } catch (e) {
    console.error("[macro-activate] db error:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  }
}
