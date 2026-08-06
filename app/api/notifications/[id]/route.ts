import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: Date | string;
};

// One alert — hit by NotificationCenter when a push tap lands on #n=<id>.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  await ensurePushTables();
  const { rows } = await pool.query<Row>(
    `SELECT id::text AS id, type, title, body, url, created_at
     FROM notifications
     WHERE id = $1
     LIMIT 1`,
    [numericId]
  );
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    notification: {
      id: Number(row.id),
      type: row.type,
      title: row.title,
      body: row.body,
      url: row.url,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    },
  });
}
