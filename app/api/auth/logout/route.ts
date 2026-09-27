import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "@/lib/session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { pool } from "@/lib/db";

export async function POST() {
  try {
    const cookieStore = await cookies();

    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions
    );

    // v2: also burn the server-side row so the sid can never come back.
    const sid = session.user?.sid;
    if (sid) {
      try {
        await pool.query(`UPDATE mcwv_user_sessions SET revoked_at = now() WHERE sid = $1`, [sid]);
      } catch {
        /* cookie is destroyed anyway; the row idles out harmlessly */
      }
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
