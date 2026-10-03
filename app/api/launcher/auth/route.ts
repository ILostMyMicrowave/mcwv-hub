import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import { RateLimiter } from "@/lib/rateLimit";

const limiter = new RateLimiter({ windowMs: 60_000, max: 60 });
function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}
const HWID_RE = /^[a-f0-9]{64}$/;

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rl = limiter.check(ip);
  if (!rl.success) return NextResponse.json({ ok: 0, reason: "slow down" }, { status: 429 });

  let user = await getAuthenticatedUser();
  let fromLauncher = false;
  let bearerKey: string | null = null;

  const authHeader = req.headers.get("authorization");
  if (!user && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (/^[A-Za-z0-9_-]{16,80}$/.test(token)) {
      try {
        const { rows } = await pool.query(
          `select k.member_id, k.member_name, k.revoked_at, u.username, u.role from mcwv_macro_keys k left join users u on u.id = k.member_id where k.key = $1 limit 1`,
          [token]
        );
        if (rows[0] && !rows[0].revoked_at) {
          user = { id: rows[0].member_id, username: rows[0].member_name || rows[0].username, role: rows[0].role || "member" } as any;
          fromLauncher = true;
          bearerKey = token;
        }
      } catch {}
    }
  }

  if (!user) return NextResponse.json({ ok: 0, reason: "not_logged_in", needLogin: true }, { status: 401 });

  const hwid = req.nextUrl.searchParams.get("hwid")?.toLowerCase().trim() || "";
  const pcName = req.nextUrl.searchParams.get("pc")?.slice(0, 64) || "unknown";

  if (hwid && !HWID_RE.test(hwid)) {
    return NextResponse.json({ ok: 0, reason: "invalid_hwid" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `select id, key, member_name, revoked_at, last_seen from mcwv_macro_keys where member_id = $1 and revoked_at is null order by last_seen desc nulls last, issued_at desc limit 1`,
      [user.id]
    );
    const keyRow = rows[0];

    if (!keyRow) {
      return NextResponse.json({
        ok: 1,
        whitelisted: false,
        member: user.username,
        reason: "not_whitelisted",
        message: "Not whitelisted — contact officer on Discord",
        hwid: hwid || undefined,
      });
    }

    if (hwid) {
      try {
        await pool.query(
          `update mcwv_macro_keys set last_seen = now(), last_ip = $2, last_pc = $3,
                  seen_pcs = array(select distinct unnest(array_append(coalesce(seen_pcs, '{}'), $4)) order by 1),
                  last_fp = $4
           where id = $1`,
          [keyRow.id, ip, pcName, hwid]
        );
        await pool.query(
          `insert into mcwv_macro_activations (key_id, ip, pc, fp, version, member) values ($1,$2,$3,$4,$5,$6)`,
          [keyRow.id, ip, pcName, hwid, "launcher-1.0.0", user.username]
        );
        const { rows: hwidRows } = await pool.query(
          `select array_length(seen_pcs, 1) as c from mcwv_macro_keys where id = $1`,
          [keyRow.id]
        );
        const hwidCount = hwidRows[0]?.c || 1;
        if (hwidCount > 2) {
          return NextResponse.json({
            ok: 1,
            whitelisted: true,
            member: user.username,
            key: bearerKey ? undefined : keyRow.key.slice(0, 8) + "...",
            hwidBound: true,
            hwidCount,
            warning: hwidCount > 2 ? "Too many PCs — officer review" : undefined,
            version: "3.5",
          });
        }
      } catch (e) {
        console.error("[launcher/auth] hwid update failed", (e as Error).message?.slice(0, 200));
      }
    }

    return NextResponse.json({
      ok: 1,
      whitelisted: true,
      member: user.username,
      role: (user as any).role,
      key: fromLauncher ? undefined : keyRow.key,
      hwidBound: !!hwid,
      version: "3.5",
      launcherVersion: "1.0.0",
      fromLauncher,
    });
  } catch (e) {
    console.error("[launcher/auth] db error", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ ok: 0, reason: "db_down", whitelisted: true, member: user.username, warning: "DB blip, allowing" });
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = limiter.check(ip + "-post");
  if (!rl.success) return NextResponse.json({ ok: 0, reason: "slow down" }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: 0, reason: "bad json" }, { status: 400 }); }

  const hwid = String(body.hwid || "").toLowerCase().trim();
  if (hwid && !HWID_RE.test(hwid)) return NextResponse.json({ ok: 0, reason: "invalid_hwid" }, { status: 400 });

  const url = new URL(req.url);
  if (hwid) url.searchParams.set("hwid", hwid);
  if (body.pc) url.searchParams.set("pc", String(body.pc).slice(0, 64));

  const newReq = new NextRequest(url, {
    headers: req.headers,
    method: "GET",
  });
  return GET(newReq);
}
