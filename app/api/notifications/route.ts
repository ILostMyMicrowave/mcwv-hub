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

function mapRow(row: Row) {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

// Recent alerts for the in-app popup's "menu" list.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await ensurePushTables();
  const { rows } = await pool.query<Row>(
    `SELECT id::text AS id, type, title, body, url, created_at
     FROM notifications
     ORDER BY id DESC
     LIMIT 20`
  );
  return NextResponse.json({ success: true, notifications: rows.map(mapRow) });
}
