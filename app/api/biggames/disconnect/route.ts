import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { bigGamesConfigured, getTokenStatus } from "@/lib/biggames";

export const dynamic = "force-dynamic";

// Tells the profile page whether the current user has authorized BIG Games.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const status = await getTokenStatus(auth.user.id);
  return NextResponse.json({
    success: true,
    configured: bigGamesConfigured(),
    connected: Boolean(status),
    status,
  });
}
