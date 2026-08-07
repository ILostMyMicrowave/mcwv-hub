import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { loadScoutState } from "@/lib/scoutSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Owner-only: latest Enemy Intel snapshot (full tables included).
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "owner") {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }

  const state = await loadScoutState();
  return NextResponse.json({ success: true, state });
}
