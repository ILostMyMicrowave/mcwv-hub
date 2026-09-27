import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // POST-only route; never build-time rendered
import { cookies } from "next/headers";
import { getIronSession, sessionOptions, invalidateSessionCache, type SessionData } from "@/lib/session";
import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { sendPushToUser } from "@/lib/pushServer";

/**
 * "Sign out everywhere" v2: revoke every session row of this user EXCEPT the
 * one behind this very cookie (matched by sid) — the row IS the grace, so no
 * timestamp math, no re-stamping, no raw-decode exception. Then push the
 * kick to every other subscribed device (the initiating device's endpoint is
 * skipped when the client can name it), whose service worker bounces open
 * tabs straight to /login even from a frozen/backgrounded state.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { currentEndpoint?: unknown }
    | null;
  const currentEndpoint =
    typeof body?.currentEndpoint === "string" ? body.currentEndpoint : null;

  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const ownSid = session.user?.sid ?? null;

    const result = await pool.query(
      `UPDATE mcwv_user_sessions
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND ($2::uuid IS NULL OR sid <> $2::uuid)
       RETURNING sid`,
      [user.id, ownSid]
    );

    invalidateSessionCache();

    // Best-effort: a push failure must not fail the revoke (rows are the
    // source of truth; watchdog + next navigation still land the logout).
    void sendPushToUser(
      user.id,
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
  } catch (err) {
    console.error("[revoke] failed:", err);
    return NextResponse.json({ error: "Could not sign out other devices." }, { status: 500 });
  }
}
