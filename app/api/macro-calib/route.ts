import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { pool } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/authUser";
import { oncePerIsolate } from "@/lib/db";

async function ensureTable() {
  await oncePerIsolate("macro-calib-ddl", async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcwv_macro_calibs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        task_name text NOT NULL,
        member_id integer REFERENCES users(id) ON DELETE SET NULL,
        member_name text NOT NULL,
        checks jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        is_official boolean NOT NULL DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS idx_mcwv_calib_task ON mcwv_macro_calibs(task_name);
      CREATE INDEX IF NOT EXISTS idx_mcwv_calib_official ON mcwv_macro_calibs(task_name, is_official) WHERE is_official = true;
    `);
  });
}

// GET /api/macro-calib?task=example%20claim — returns best calibration for task (official first, then most recent)
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const task = (req.nextUrl.searchParams.get("task") || "").trim().slice(0, 64);
  if (!task) return NextResponse.json({ error: "need task param" }, { status: 400 });

  try {
    await ensureTable();
    // Prefer official, then most recent from officers, then most recent from anyone
    const { rows } = await pool.query(
      `
      SELECT task_name, checks, member_name, created_at, is_official
      FROM mcwv_macro_calibs
      WHERE task_name = $1
      ORDER BY is_official DESC, created_at DESC
      LIMIT 1
      `,
      [task]
    );
    if (rows[0]) {
      return NextResponse.json({ ok: 1, task, calib: rows[0].checks, meta: rows[0] });
    }
    return NextResponse.json({ ok: 1, task, calib: null, msg: "No shared calibration yet — be the first to Set up and Share" });
  } catch (e) {
    console.error("[macro-calib] GET error:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ ok: 1, task, calib: null, dbDown: true });
  }
}

// POST /api/macro-calib — upload calibration {task, checks: {key: {hex, pt, img?}}}
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
