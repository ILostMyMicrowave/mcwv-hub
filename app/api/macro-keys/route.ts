import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import crypto from "crypto";

function genKey(): string {
  // 24 bytes -> 32 chars base64url, readable, no confusing 0/O
  return crypto.randomBytes(24).toString("base64url");
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  if (user.role !== "officer" && user.role !== "owner") return NextResponse.json({ error: "officers only" }, { status: 403 });

  try {
    const { rows } = await pool.query(
      `select k.id, k.key, k.member_name, k.member_id, u.username as member_username,
              k.issued_at, k.last_seen, k.last_ip, k.last_pc, k.runs,
              k.revoked_at, k.revoked_reason, k.seen_ips, k.seen_pcs,
              k.issued_by, iu.username as issued_by_name,
              (select count(distinct ip)::int from mcwv_macro_activations where key_id = k.id and created_at > now() - interval '24 hours') as ips_24h,
              (select count(*)::int from mcwv_macro_activations where key_id = k.id and created_at > now() - interval '7 days') as activations_7d
         from mcwv_macro_keys k
         left join users u on u.id = k.member_id
         left join users iu on iu.id = k.issued_by
        order by k.revoked_at nulls first, k.last_seen desc nulls last, k.issued_at desc`
    );
    return NextResponse.json({ ok: 1, keys: rows });
  } catch (e) {
    console.error("[macro-keys] GET failed:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  if (user.role !== "officer" && user.role !== "owner") return NextResponse.json({ error: "officers only" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const action = String(b.action ?? "");

  if (action === "issue") {
    const memberIdRaw = b.memberId;
    const memberId = memberIdRaw != null ? Number(memberIdRaw) : null;
    let memberName = String(b.memberName ?? "").replace(/[^\w.\- ]/g, "").trim().slice(0, 32);
    const notes = String(b.notes ?? "").slice(0, 200);

    if (!memberId && !memberName) return NextResponse.json({ error: "need memberId or memberName" }, { status: 400 });

    try {
      // Resolve member name if only id given
      if (memberId && !memberName) {
        const { rows } = await pool.query(`select username from users where id = $1`, [memberId]);
        memberName = rows[0]?.username ? String(rows[0].username).slice(0, 32) : `user#${memberId}`;
      }
      const key = genKey();
      const { rows } = await pool.query(
        `insert into mcwv_macro_keys (key, member_id, member_name, issued_by, notes)
         values ($1, $2, $3, $4, $5) returning id, key, member_name`,
        [key, memberId, memberName || "unknown", user.id, notes || null]
      );
      return NextResponse.json({ ok: 1, key: rows[0] });
    } catch (e) {
      console.error("[macro-keys] issue failed:", (e as Error).message?.slice(0, 200));
      return NextResponse.json({ error: "db unavailable" }, { status: 503 });
    }
  }

  if (action === "revoke") {
    const id = Number(b.id);
    const reason = String(b.reason ?? "").slice(0, 200) || "revoked by officer";
    if (!Number.isFinite(id)) return NextResponse.json({ error: "need id" }, { status: 400 });
    try {
      await pool.query(`update mcwv_macro_keys set revoked_at = now(), revoked_reason = $2 where id = $1`, [id, reason]);
      return NextResponse.json({ ok: 1 });
    } catch (e) {
      console.error("[macro-keys] revoke failed:", (e as Error).message?.slice(0, 200));
      return NextResponse.json({ error: "db unavailable" }, { status: 503 });
    }
  }

  if (action === "restore") {
    const id = Number(b.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "need id" }, { status: 400 });
    try {
      await pool.query(`update mcwv_macro_keys set revoked_at = null, revoked_reason = null where id = $1`, [id]);
      return NextResponse.json({ ok: 1 });
    } catch (e) {
      console.error("[macro-keys] restore failed:", (e as Error).message?.slice(0, 200));
      return NextResponse.json({ error: "db unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
