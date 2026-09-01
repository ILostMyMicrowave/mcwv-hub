import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

const MAX_BYTES = 2 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function authorized(request: Request) {
  const authHeader = request.headers.get("x-admin-api-key") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  const provided =
    authHeader || (bearer.toLowerCase().startsWith("bearer ") ? bearer.split(" ")[1] : "");
  const expected = process.env.BOT_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? "";
  return Boolean(expected && provided && provided === expected);
}

async function ensureMediaTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_media (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file is required" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "file too large" }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length < 8 || !buf.subarray(0, 4).equals(PNG_MAGIC)) {
      return NextResponse.json({ success: false, error: "PNG only" }, { status: 400 });
    }

    const id = randomUUID();
    await ensureMediaTable();
    await pool.query(
      `INSERT INTO hub_media (id, content_type, bytes) VALUES ($1, $2, $3)`,
      [id, "image/png", buf]
    );

    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcwv-hub.vercel.app").replace(/\/$/, "");
    const url = `${site}/api/media/${id}`;
    return NextResponse.json({ success: true, id, url });
  } catch (err) {
    console.error("[internal/media] upload failed:", err);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
