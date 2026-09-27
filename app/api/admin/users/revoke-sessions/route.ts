import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // POST-only route; never build-time rendered
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";
import { invalidateSessionCache } from "@/lib/session";
import { invalidateAuthenticatedUserCache } from "@/lib/authUser";
import { sendPushToUser } from "@/lib/pushServer";

/**
 * Staff tool: kick EVERY device of one user (owner-only, matching sibling
 * role/delete-account routes). v2 = flip the target's live session rows; the
 * shared session reader then rejects those cookies everywhere within seconds,
 * and each subscribed device gets bounced by its own service worker at once.
 * Zero rows is fine too: legacy/v1 cookies are already dead under v2 rules.
 */
export async function POST(request: Request) {
  const check = await requireAdminUser("owner");
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null as unknown);
  const targetId = Number(
    body && typeof body === "object" ? (body as Record<string, unknown>).user_id : NaN
  );
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `UPDATE mcwv_user_sessions
       SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING sid`,
      [targetId]
    );

    invalidateSessionCache();
    invalidateAuthenticatedUserCache(targetId);

    void sendPushToUser(
      targetId,
      {
        title: "Signed out of MCWV Hub",
        body: "A moderator signed out your devices.",
        url: "/login?reason=signed-out",
        tag: "mcwv-kick",
        action: "kick",
      }
    ).catch((err) => console.error("[admin-revoke] kick push failed:", err));

    return NextResponse.json({ ok: true, kicked: result.rows.length });
  } catch (err) {
    console.error("[admin-revoke] failed:", err);
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }
}
