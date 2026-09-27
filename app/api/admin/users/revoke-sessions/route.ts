import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // POST-only route; never build-time rendered
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";
import { invalidateRevokedAtCache } from "@/lib/session";
import { invalidateAuthenticatedUserCache } from "@/lib/authUser";

/**
 * Staff tool: kick every device of one user. OWNER-only, matching the sibling
 * role/delete-account routes; officers keep the member-facing self revoke.
 * No grace stamp here — that is exactly the point.
 */
export async function POST(request: Request) {
  const check = await requireAdminUser("owner");
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null as unknown);
  const targetId = Number(
    (body && typeof body === "object" ? (body as Record<string, unknown>).user_id : NaN)
  );
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET sessions_revoked_at = now()
       WHERE id = $1
       RETURNING id`,
      [targetId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    invalidateRevokedAtCache(targetId);
    invalidateAuthenticatedUserCache(targetId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }
}
