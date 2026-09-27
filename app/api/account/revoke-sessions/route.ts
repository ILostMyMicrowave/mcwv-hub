import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // POST-only route; never build-time rendered
export const maxDuration = 30; // never ride the pooler ladder past the cap
import { cookies } from "next/headers";
import { getIronSession, sessionOptions, invalidateSessionCache, type SessionData } from "@/lib/session";
import { pool } from "@/lib/db";
import { sendPushToUser } from "@/lib/pushServer";
import { withDeadline, kickCapMs } from "@/lib/deadline";

/**
 * "Sign out everywhere" v2: revoke every session row of this user EXCEPT the
 * one behind this very cookie (matched by sid) — the row IS the grace, so no
 * timestamp math, no re-stamping, no raw-decode exception. Then push the
 * kick to every other subscribed device (the initiating device's endpoint is
 * skipped when the client can name it), whose service worker bounces open
 * tabs straight to /login even from a frozen/backgrounded state.
 *
 * v2.1: the WHOLE handler runs under a wall-clock deadline (10s, tunable via
 * MCWV_KICK_CAP_MS). During a pooler storm the button now gets an honest
 * "nobody was signed out yet — try again" instead of riding the retry ladder
 * for ~90s. The statements here are idempotent, so a retry is always safe.
 */
export async function POST(request: Request) {
  const raced = await withDeadline(revoke(request), kickCapMs());

  if (!raced.ok) {
    if (raced.timedOut) {
      return NextResponse.json(
        { error: "The hub's database didn't answer in time — nobody was signed out yet. Try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[revoke] failed:", raced.error);
    return NextResponse.json({ error: "Could not sign out other devices." }, { status: 500 });
  }

  return raced.value;
}

async function revoke(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { currentEndpoint?: unknown }
    | null;
  const currentEndpoint =
    typeof body?.currentEndpoint === "string" ? body.currentEndpoint : null;

  // Identity via the shared wrapper: capped (1.2s), sid-verified, and the
  // 3s device cache means a storm cannot stall this first step either.
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const userId = Number(session.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownSid = session.user?.sid ?? null;

  const result = await pool.query(
    `UPDATE mcwv_user_sessions
     SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND ($2::uuid IS NULL OR sid <> $2::uuid)
     RETURNING sid`,
    [userId, ownSid]
  );

  invalidateSessionCache();

  // Best-effort: a push failure must not fail the revoke (rows are the
  // source of truth; watchdog + next navigation still land the logout).
  void sendPushToUser(
    userId,
    {
      title: "Signed out of MCWV Hub",
      body: "Your account was signed out from another device.",
      url: "/login?reason=signed-out",
      tag: "mcwv-kick",
      action: "kick",
      // Tells every kicked device which sid is the revoker's, so a stale
      // worker that still receives a stray kick never bounces its own tab.
      sid: ownSid ?? undefined,
    },
    { skipEndpoint: currentEndpoint }
  ).catch((err) => console.error("[revoke] kick push failed:", err));

  return NextResponse.json({ ok: true, kicked: result.rows.length });
}
