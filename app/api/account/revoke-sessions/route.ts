import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // POST-only route; never build-time rendered
import { cookies } from "next/headers";
import { getIronSession as getIronSessionRaw } from "iron-session"; // RAW on purpose: the grace stamp must be written even while our own cutoff goes live mid-request
import { getAuthenticatedUser, invalidateAuthenticatedUserCache } from "@/lib/authUser";
import { pool } from "@/lib/db";
import {
  sessionOptions,
  invalidateRevokedAtCache,
  type SessionData,
} from "@/lib/session";

/**
 * "Sign out everywhere": bump this user's revocation cutoff. Every OTHER
 * device (older cookies) starts 401ing within the 10s cache TTL; THIS device
 * stays signed in — it re-signs its cookie with the cutoff as a grace token.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET sessions_revoked_at = now()
       WHERE id = $1
       RETURNING floor(extract(epoch from sessions_revoked_at))::bigint AS revoked_at`,
      [user.id]
    );
    const cutoff = Number(result.rows[0]?.revoked_at);
    if (!Number.isFinite(cutoff)) {
      return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
    }

    // Grace for the current device: stamp its session and re-save (raw —
    // verified decode would already see the new cutoff without grace).
    const session = await getIronSessionRaw<SessionData>(await cookies(), sessionOptions);
    if (session.user?.id === user.id) {
      session.user.revokets = cutoff;
      await session.save();
    }

    invalidateRevokedAtCache(user.id); // this isolate applies it immediately
    invalidateAuthenticatedUserCache(user.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }
}
