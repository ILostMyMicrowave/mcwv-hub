import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { rows } = await pool.query<{ content_type: string; bytes: Buffer }>(
      `SELECT content_type, bytes FROM hub_media WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row?.bytes) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = row.bytes instanceof Buffer ? row.bytes : Buffer.from(row.bytes);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": row.content_type || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
