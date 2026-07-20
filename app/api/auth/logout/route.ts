import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export async function POST() {
  try {
    const session = await getIronSession<SessionData>(
      cookies(),
      sessionOptions
    );

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
