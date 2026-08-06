import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { getStateText, setStateText } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "alert_broadcasts_enabled";

// Officer-facing kill-switch for "Discord broadcasts → app alerts".
// Default is ON; absent key means enabled.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const value = await getStateText(KEY);
  const officer = auth.user.role === "officer" || auth.user.role === "owner";
  return NextResponse.json({ success: true, enabled: value !== "false", officer });
}

const schema = z.object({ enabled: z.boolean() });

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "officer" && auth.user.role !== "owner") {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid value." }, { status: 400 });
  }

  await setStateText(KEY, parsed.data.enabled ? "true" : "false");
  return NextResponse.json({ success: true, enabled: parsed.data.enabled });
}
