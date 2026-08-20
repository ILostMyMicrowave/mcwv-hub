import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { bigGamesConfigured, getValidatedTokenStatus } from "@/lib/biggames";

export const dynamic = "force-dynamic";

// Tells the profile page whether the current user has a VALID BIG Games
// authorization. The token is verified against the BIG Games API so a revoked
// or expired token reports as "not connected" (and is cleared).
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const status = await getValidatedTokenStatus(auth.user.id);
  return NextResponse.json({
    success: true,
    configured: bigGamesConfigured(),
    connected: Boolean(status),
    status,
  });
}
