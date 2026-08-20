import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { deleteAccessToken } from "@/lib/biggames";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await deleteAccessToken(auth.user.id);
  return NextResponse.json({ success: true });
}
