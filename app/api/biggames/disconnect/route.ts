import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { deleteAccessToken } from "@/lib/biggames";

export const dynamic = "force-dynamic";

// Invalidate the /api/biggames/status cache for this user so the site reflects
// the disconnect immediately rather than waiting out the 30s cache TTL.
declare global {
  var _biggamesStatusCache: Map<string, { at: number; payload: any }> | undefined;
}

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await deleteAccessToken(auth.user.id);

  // Best-effort: the status route keeps its cache in a module-level Map, which
  // is per-isolate. We reach the same map via a global handle (same Vercel
  // isolate gets both routes). If it's a different isolate the 30s TTL clears
  // it soon enough anyway.
  if (global._biggamesStatusCache) {
    global._biggamesStatusCache.delete(String(auth.user.id));
  }

  return NextResponse.json({ success: true });
}
