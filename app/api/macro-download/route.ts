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

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  // Find or auto-issue a key for this member
  let keyRow: { id: number; key: string; member_name: string } | null = null;
  try {
    const { rows } = await pool.query(
      `select id, key, member_name from mcwv_macro_keys where member_id = $1 and revoked_at is null order by last_seen desc nulls last, issued_at desc limit 1`,
      [user.id]
    );
    if (rows[0]) keyRow = rows[0];
    else {
      // auto-issue
      const newKey = genKey();
      const { rows: ins } = await pool.query(
        `insert into mcwv_macro_keys (key, member_id, member_name, issued_by, notes) values ($1,$2,$3,$2,$4) returning id, key, member_name`,
        [newKey, user.id, user.username.slice(0, 32), "auto-issued on first download"]
      );
      keyRow = ins[0];
    }
  } catch (e) {
    console.error("[macro-download] key lookup/issue failed:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  }

  if (!keyRow) return NextResponse.json({ error: "could not issue key" }, { status: 503 });

  // Read template
  const tplPath = path.join(process.cwd(), "assets", "mcwv-macros.template.ahk");
  let tpl: string;
  try {
    tpl = fs.readFileSync(tplPath, "utf8");
  } catch {
    return NextResponse.json({ error: "template missing — officer must upload latest dist" }, { status: 503 });
  }

  const origin = req.nextUrl.origin;
  const telemetryUrl = `${origin}/api/macro-report`;
  const activateUrl = `${origin}/api/macro-activate`;

  // Personalize: replace config lines. The template has known lines:
  // MEMBER_KEY := ""  (we will inject), plus MEMBER var? Actually config has no MEMBER, telemetry uses A_UserName. We'll inject MEMBER_NAME and MEMBER_KEY.
  // We keep it simple: prepend a personalization header that overrides config.ahk vars, because pack.js order is config first, then rest.
  // AHK v2: re-assigning a global var later overrides earlier. So we can prepend after banner? Actually better to replace in-file for robustness.
  // We'll do regex replacements, and also prepend a comment block.

  const memberKey = keyRow.key;
  const memberName = user.username;

  // Replace config lines if they exist, else prepend overrides at top after #Requires
  let out = tpl;

  // Ensure MEMBER_KEY line exists — replace first occurrence
  if (out.includes("MEMBER_KEY")) {
    out = out.replace(/MEMBER_KEY\s*:=\s*".*?"/, `MEMBER_KEY := "${ahkEsc(memberKey)}"`);
  } else {
    // fallback: inject after MACRO_VERSION line
    out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nMEMBER_KEY := "${ahkEsc(memberKey)}"`);
  }

  if (out.includes("MEMBER :=")) {
    out = out.replace(/MEMBER\s*:=\s*".*?"/, `MEMBER := "${ahkEsc(memberName)}"`);
  } else {
    out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nMEMBER := "${ahkEsc(memberName)}"`);
  }

  // TELEMETRY_URL / TELEMETRY_KEY — use per-member key for telemetry too (route now accepts it)
  if (out.includes("TELEMETRY_URL")) {
    out = out.replace(/TELEMETRY_URL\s*:=\s*".*?"/, `TELEMETRY_URL := "${ahkEsc(telemetryUrl)}"`);
  }
  if (out.includes("TELEMETRY_KEY")) {
    out = out.replace(/TELEMETRY_KEY\s*:=\s*".*?"/, `TELEMETRY_KEY := "${ahkEsc(memberKey)}"`);
  }

  // LICENSE / AUTH URL — add if not present
  if (out.includes("AUTH_URL")) {
    out = out.replace(/AUTH_URL\s*:=\s*".*?"/, `AUTH_URL := "${ahkEsc(activateUrl)}"`);
  } else {
    out = out.replace(/(MACRO_VERSION\s*:=\s*".*?")/, `$1\nAUTH_URL := "${ahkEsc(activateUrl)}"`);
  }

  // Prepend watermark comment block (traceability, not security)
  const watermark = `; ───────────────────────────────────────────────────────────
;  PERSONAL BUILD — ${memberName} — key ${memberKey.slice(0, 8)}… — ${new Date().toISOString().slice(0, 10)}
;  This file is tied to your hub account. If it leaks, we know who.
;  Do not forward — send them to ${origin}/macros to get their own.
; ───────────────────────────────────────────────────────────
`;

  // Insert watermark right after first line (#Requires) for visibility
  out = out.replace(/(#Requires AutoHotkey v2\.0[^\n]*\n)/, `$1${watermark}\n`);

  // Log download (fire-and-forget)
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
