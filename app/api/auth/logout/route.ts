import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "@/lib/session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { pool } from "@/lib/db";
import { withDeadline } from "@/lib/deadline";

export async function POST() {
  try {
    const cookieStore = await cookies();

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    );

    // v2: also burn the server-side row so the sid can never come back.
    // v2.1: capped at 4s — signing OUT must never hang on the pooler; if the
    // write doesn't land, the row simply idles out at cookie TTL (14d) and a
    // stolen cookie is no stronger than the stolen device it came from.
    const sid = session.user?.sid;
    if (sid) {
      await withDeadline(
        pool.query(`UPDATE mcwv_user_sessions SET revoked_at = now() WHERE sid = $1`, [sid]),
        4_000
      ); // result intentionally ignored (fail-soft by design)
    }

    await session.destroy();

    return NextResponse.json({
      success: true,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Logout failed",
      },
      {
        status: 500,
      }
    );
  }
}
