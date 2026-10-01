import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import { oncePerIsolate } from "@/lib/db";
import { RateLimiter } from "@/lib/rateLimit";
import crypto from "crypto";

const calibLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
const HEX_RE = /^#?[0-9A-Fa-f]{6}$/;
const TASK_RE = /^[a-zA-Z0-9 _\-]{1,64}$/;
const KEY_RE = /^[a-zA-Z0-9_]{1,32}$/;
const IMG_RE = /^[a-zA-Z0-9_\-]{1,40}\.(png|jpg|jpeg|bmp)$/i;

function validateChecks(obj: Record<string, unknown>): string | null {
  const keys = Object.keys(obj);
  if (keys.length === 0 || keys.length > 20) return "checks must have 1-20 entries";
  for (const k of keys) {
    if (!KEY_RE.test(k)) return `bad check name: ${k}`;
    const v = obj[k] as any;
    if (!v || typeof v !== "object") return `check ${k} must be object`;
    const hasHex = typeof v.hex === "string" && v.hex.length > 0;
    const hasPt = v.pt && typeof v.pt.fx === "number" && typeof v.pt.fy === "number";
    const hasImg = typeof v.img === "string" && v.img.length > 0;
    if (!hasHex && !hasPt && !hasImg) return `check ${k} needs hex, pt, or img`;
    if (hasHex && !HEX_RE.test(String(v.hex))) return `check ${k} bad hex ${v.hex}`;
    if (hasPt) {
      const fx = Number(v.pt.fx);
      const fy = Number(v.pt.fy);
      if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return `check ${k} pt out of range`;
    }
    if (hasImg && !IMG_RE.test(String(v.img))) return `check ${k} bad img ${v.img}`;
  }
  return null;
}

function signCalib(task: string, checks: unknown): string {
  const secret = process.env.MACRO_SIGNING_KEY || process.env.MACRO_REPORT_KEY || "dev-signing-key-mcwv";
  const payload = JSON.stringify({ task, checks });
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

async function ensureTable(): Promise<void> {
  await oncePerIsolate("macro-calib-ddl", async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcwv_macro_calibs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        task_name text NOT NULL,
        member_id integer REFERENCES users(id) ON DELETE SET NULL,
        member_name text NOT NULL,
        checks jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        is_official boolean NOT NULL DEFAULT false,
        signature text
      );
      CREATE INDEX IF NOT EXISTS idx_mcwv_calib_task ON mcwv_macro_calibs(task_name);
      CREATE INDEX IF NOT EXISTS idx_mcwv_calib_official ON mcwv_macro_calibs(task_name, is_official) WHERE is_official = true;
      ALTER TABLE mcwv_macro_calibs ADD COLUMN IF NOT EXISTS signature text;
    `);
  });
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const task = (req.nextUrl.searchParams.get("task") || "").trim().slice(0, 64);
  if (!task) return NextResponse.json({ error: "need task param" }, { status: 400 });
  if (!TASK_RE.test(task)) return NextResponse.json({ error: "bad task name" }, { status: 400 });

  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT task_name, checks, member_name, created_at, is_official, signature
       FROM mcwv_macro_calibs
       WHERE task_name = $1
       ORDER BY is_official DESC, created_at DESC
       LIMIT 1`,
      [task]
    );
    if (rows[0]) {
      const row = rows[0] as any;
      let sig = row.signature as string | null;
      if (row.is_official && !sig) {
        sig = signCalib(row.task_name, row.checks);
      }
      return NextResponse.json({
        ok: 1,
        task,
        calib: row.checks,
        meta: { ...row, signature: sig },
        signature: sig,
        signed: !!row.is_official,
      });
    }
    return NextResponse.json({ ok: 1, task, calib: null, msg: "No shared calibration yet" });
  } catch (err) {
    console.error("[macro-calib] GET error:", (err as Error).message?.slice(0, 200));
    return NextResponse.json({ ok: 1, task, calib: null, dbDown: true });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const rl = calibLimiter.check(`calib:${user.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down — max 20 per hour" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const task = String((body as any).task || "").trim().slice(0, 64);
  const checks = (body as any).checks;
  const isOfficial = Boolean((body as any).isOfficial) && (user.role === "officer" || user.role === "owner");

  if (!task || !checks || typeof checks !== "object") {
    return NextResponse.json({ error: "need task and checks" }, { status: 400 });
  }
  if (!TASK_RE.test(task)) return NextResponse.json({ error: "bad task name" }, { status: 400 });

  const checkObj = checks as Record<string, unknown>;
  const validationErr = validateChecks(checkObj);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 400 });

  try {
    await ensureTable();
    if (isOfficial) {
      await pool.query(`UPDATE mcwv_macro_calibs SET is_official = false WHERE task_name = $1 AND is_official = true`, [task]);
    }
    const signature = isOfficial ? signCalib(task, checkObj) : null;
    const { rows } = await pool.query(
      `INSERT INTO mcwv_macro_calibs (task_name, member_id, member_name, checks, is_official, signature)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, task_name, created_at, is_official, signature`,
      [task, user.id, user.username.slice(0, 32), JSON.stringify(checkObj), isOfficial, signature]
    );
    return NextResponse.json({ ok: 1, id: rows[0].id, task, isOfficial, signature: rows[0].signature });
  } catch (err) {
    console.error("[macro-calib] POST error:", (err as Error).message?.slice(0, 200));
    return NextResponse.json({ error: "Database busy" }, { status: 503 });
  }
}
