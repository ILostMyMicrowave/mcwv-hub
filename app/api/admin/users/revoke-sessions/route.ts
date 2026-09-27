import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // POST-only route; never build-time rendered
export const maxDuration = 30; // same storm discipline as the self-kick route
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";
import { invalidateSessionCache } from "@/lib/session";
import { invalidateAuthenticatedUserCache } from "@/lib/authUser";
import { sendPushToUser } from "@/lib/pushServer";
import { withDeadline, kickCapMs } from "@/lib/deadline";

/**
 * Staff tool: kick EVERY device of one user (owner-only, matching sibling
 * role/delete-account routes). v2 = flip the target's live session rows; the
 * shared session reader then rejects those cookies everywhere within seconds,
 * and each subscribed device gets bounced by its own service worker at once.
 * Zero rows is fine too: legacy/v1 cookies are already dead under v2 rules.
 *
 * v2.1: whole handler under the same wall-clock deadline as the self-kick —
 * honest 503 + "try again" during a pooler storm instead of a ~90s ride.
 */
export async function POST(request: Request) {
  const raced = await withDeadline(kick(request), kickCapMs());

  if (!raced.ok) {
    if (raced.timedOut) {
      return NextResponse.json(
        { error: "The hub's database didn't answer in time — nobody was signed out yet. Try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[admin-revoke] failed:", raced.error);
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }

  return raced.value;
}

async function kick(request: Request): Promise<Response> {
  const check = await requireAdminUser("owner");
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null as unknown);
  const targetId = Number(
    body && typeof body === "object" ? (body as Record<string, unknown>).user_id : NaN
  );
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

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
}
