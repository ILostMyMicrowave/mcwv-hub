import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  // null clears the attachment
  imageUrl: z.string().url().max(1000).nullable(),
});

// Officers can attach (or clear) an image on ANY alert, straight from the
// inbox — war banners, broadcast artwork, whatever.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "officer" && auth.user.role !== "owner") {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  await ensurePushTables();
  const { rowCount } = await pool.query(
    `UPDATE notifications SET image_url = $1 WHERE id = $2`,
    [parsed.data.imageUrl, numericId]
  );
  if (!rowCount) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, imageUrl: parsed.data.imageUrl });
}
