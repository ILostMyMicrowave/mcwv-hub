import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import fs from "fs";
import path from "path";
import crypto from "crypto";

function genKey(): string { return crypto.randomBytes(24).toString("base64url"); }
function ahkEsc(s: string): string { return String(s).replace(/"/g, '""'); }

let cachedTpl: string | null = null;
let cachedMtime: number = 0;
function getTemplate(): string {
  const tplPath = path.join(process.cwd(), "assets", "mcwv-macros.template.ahk");
  try {
    const stat = fs.statSync(tplPath);
    if (cachedTpl && stat.mtimeMs === cachedMtime) return cachedTpl;
    const content = fs.readFileSync(tplPath, "utf8");
    cachedTpl = content; cachedMtime = stat.mtimeMs; return content;
  } catch {
    for (const p of [path.join(process.cwd(), "public", "mcwv-macros.template.ahk"), path.join(process.cwd(), "assets", "mcwv-macros.ahk")]) {
      try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch {}
    }
    throw new Error("template not found");
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in to get your macros" }, { status: 401 });

  let keyRow: { id: number; key: string; member_name: string } | null = null;
  let dbDown = false;
  try {
    const { rows } = await pool.query(
      `select id, key, member_name from mcwv_macro_keys where member_id = $1 and revoked_at is null order by last_seen desc nulls last, issued_at desc limit 1`,
      [user.id]
    );
    if (rows[0]) keyRow = rows[0];
    else {
      const newKey = genKey();
      const { rows: ins } = await pool.query(
        `insert into mcwv_macro_keys (key, member_id, member_name, issued_by, notes) values ($1,$2,$3,$2,$4) returning id, key, member_name`,
        [newKey, user.id, user.username.slice(0, 32), "auto-issued on first download"]
      );
      keyRow = ins[0];
    }
  } catch (e) {
    console.error("[macro-download] db blip:", (e as Error).message?.slice(0, 200));
    dbDown = true;
  }

  let tpl: string;
  try { tpl = getTemplate(); } catch {
    return NextResponse.json({ error: "Macro template missing on server — officer needs to upload assets/mcwv-macros.template.ahk" }, { status: 503 });
  }

  const origin = req.nextUrl.origin;
  if (dbDown || !keyRow) {
    const watermark = `; ───────────────────────────────────────────────────────────
;  Temporary build for ${user.username} — DB blip, unpersonalized, works fine
;  Re-download from ${origin}/macros later for personal key — ${new Date().toISOString().slice(0, 10)}
; ───────────────────────────────────────────────────────────
`;
    const out = tpl.replace(/(#Requires AutoHotkey v2\.0[^\n]*\n)/, `$1${watermark}\n`);
    // FIX: use octet-stream so mobile saves as .ahk not .txt
    return new NextResponse(out, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="mcwv-macros-${user.username}-temp.ahk"; filename*=UTF-8''mcwv-macros-${encodeURIComponent(user.username)}-temp.ahk`,
        "Cache-Control": "no-store",
        "X-MCWV-DB-Down": "1",
      },
    });
  }

  const memberKey = keyRow.key;
  const memberName = user.username;
  let out = tpl;
  if (out.includes("MEMBER_KEY")) out = out.replace(/MEMBER_KEY\s*:=\s*".*?"/, `MEMBER_KEY := "${ahkEsc(memberKey)}"`);
  else out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nMEMBER_KEY := "${ahkEsc(memberKey)}"`);
  if (out.includes("MEMBER :=")) out = out.replace(/MEMBER\s*:=\s*".*?"/, `MEMBER := "${ahkEsc(memberName)}"`);
  else out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nMEMBER := "${ahkEsc(memberName)}"`);
  if (out.includes("TELEMETRY_URL")) out = out.replace(/TELEMETRY_URL\s*:=\s*".*?"/, `TELEMETRY_URL := "${ahkEsc(`${origin}/api/macro-report`)}"`);
  if (out.includes("TELEMETRY_KEY")) out = out.replace(/TELEMETRY_KEY\s*:=\s*".*?"/, `TELEMETRY_KEY := "${ahkEsc(memberKey)}"`);
  if (out.includes("AUTH_URL")) out = out.replace(/AUTH_URL\s*:=\s*".*?"/, `AUTH_URL := "${ahkEsc(`${origin}/api/macro-activate`)}"`);
  else out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nAUTH_URL := "${ahkEsc(`${origin}/api/macro-activate`)}"`);

  const watermark = `; ───────────────────────────────────────────────────────────
;  Personal build for ${memberName} — key ${memberKey.slice(0, 8)}… — ${new Date().toISOString().slice(0, 10)}
;  Just for you — get friends their own at ${origin}/macros
; ───────────────────────────────────────────────────────────
`;
  out = out.replace(/(#Requires AutoHotkey v2\.0[^\n]*\n)/, `$1${watermark}\n`);

  try { await pool.query(`update mcwv_macro_keys set last_seen = now() where id = $1`, [keyRow.id]); } catch {}

  // FIX: octet-stream + proper filename* so iOS/Android saves as .ahk not .txt
  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="mcwv-macros-${memberName}.ahk"; filename*=UTF-8''mcwv-macros-${encodeURIComponent(memberName)}.ahk`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
