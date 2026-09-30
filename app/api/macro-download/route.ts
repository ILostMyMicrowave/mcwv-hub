import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import fs from "fs";
import path from "path";
import crypto from "crypto";

function genKey(): string {
  return crypto.randomBytes(24).toString("base64url");
}
function ahkEsc(s: string): string {
  return String(s).replace(/"/g, '""');
}

let cachedTpl: string | null = null;
let cachedMtime: number = 0;
function getTemplate(): string {
  const tplPath = path.join(process.cwd(), "assets", "mcwv-macros.template.ahk");
  try {
    const stat = fs.statSync(tplPath);
    if (cachedTpl && stat.mtimeMs === cachedMtime) return cachedTpl;
    const content = fs.readFileSync(tplPath, "utf8");
    cachedTpl = content;
    cachedMtime = stat.mtimeMs;
    return content;
  } catch {
    const altPaths = [
      path.join(process.cwd(), "public", "mcwv-macros.template.ahk"),
      path.join(process.cwd(), "assets", "mcwv-macros.ahk"),
    ];
    for (const p of altPaths) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
      } catch {}
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
    console.error("[macro-download] db blip on key lookup/issue:", (e as Error).message?.slice(0, 200));
    dbDown = true;
    // Don't fail yet — we'll serve a temporary unpersonalized file so member isn't blocked mid-war
  }

  let tpl: string;
  try {
    tpl = getTemplate();
  } catch {
    console.error("[macro-download] template missing");
    return NextResponse.json({ 
      error: "Macro file isn't ready on the server yet. An officer needs to upload assets/mcwv-macros.template.ahk",
    }, { status: 503 });
  }

  const origin = req.nextUrl.origin;

  // If DB down, serve temporary file (nokey mode) with clear watermark — member can re-download later for personal key
  if (dbDown || !keyRow) {
    const watermark = `; ───────────────────────────────────────────────────────────
;  Temporary build for ${user.username} — DB was having a moment, so this is unpersonalized
;  It works fine, but please re-download from ${origin}/macros later to get your personal key
;  Generated ${new Date().toISOString().slice(0, 10)}
; ───────────────────────────────────────────────────────────
`;
    const out = tpl.replace(/(#Requires AutoHotkey v2\.0[^\n]*\n)/, `$1${watermark}\n`);
    return new NextResponse(out, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="mcwv-macros-${user.username}-temp.ahk"`,
        "Cache-Control": "no-store",
        "X-MCWV-DB-Down": "1",
      },
    });
  }

  const memberKey = keyRow.key;
  const memberName = user.username;
  let out = tpl;
  if (out.includes("MEMBER_KEY")) {
    out = out.replace(/MEMBER_KEY\s*:=\s*".*?"/, `MEMBER_KEY := "${ahkEsc(memberKey)}"`);
  } else {
    out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nMEMBER_KEY := "${ahkEsc(memberKey)}"`);
  }
  if (out.includes("MEMBER :=")) {
    out = out.replace(/MEMBER\s*:=\s*".*?"/, `MEMBER := "${ahkEsc(memberName)}"`);
  } else {
    out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nMEMBER := "${ahkEsc(memberName)}"`);
  }
  if (out.includes("TELEMETRY_URL")) {
    out = out.replace(/TELEMETRY_URL\s*:=\s*".*?"/, `TELEMETRY_URL := "${ahkEsc(`${origin}/api/macro-report`)}"`);
  }
  if (out.includes("TELEMETRY_KEY")) {
    out = out.replace(/TELEMETRY_KEY\s*:=\s*".*?"/, `TELEMETRY_KEY := "${ahkEsc(memberKey)}"`);
  }
  if (out.includes("AUTH_URL")) {
    out = out.replace(/AUTH_URL\s*:=\s*".*?"/, `AUTH_URL := "${ahkEsc(`${origin}/api/macro-activate`)}"`);
  } else {
    out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nAUTH_URL := "${ahkEsc(`${origin}/api/macro-activate`)}"`);
  }

  const watermark = `; ───────────────────────────────────────────────────────────
;  Personal build for ${memberName} — key ${memberKey.slice(0, 8)}… — ${new Date().toISOString().slice(0, 10)}
;  This file is just for you. Please don't share it — ask friends to get their own at ${origin}/macros
; ───────────────────────────────────────────────────────────
`;
  out = out.replace(/(#Requires AutoHotkey v2\.0[^\n]*\n)/, `$1${watermark}\n`);

  try {
    await pool.query(`update mcwv_macro_keys set last_seen = now() where id = $1`, [keyRow.id]);
  } catch {}

  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="mcwv-macros-${memberName}.ahk"`,
      "Cache-Control": "no-store",
    },
  });
}
