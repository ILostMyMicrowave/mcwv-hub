import { requireAuthenticatedUser } from "@/lib/authUser";
import { NextResponse } from "next/server";
import { pushConfigured, sendPushToUser } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Fires a test notification at ONLY the requester's own devices — safe for
// every member to press, no broadcast risk.
export async function POST() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "Push isn't configured on the server yet (missing VAPID keys)." },
      { status: 503 }
    );
  }

  const result = await sendPushToUser(
    auth.user.id,
    {
      title: "MCWV Hub 🔔",
      body: "Test alert — you're all set! War pings will land right here.",
      url: "/settings",
      tag: "mcwv-test",
    },
    { type: "test" } // logged → tap opens the in-app alert popup too
  );

  return NextResponse.json({ success: true, ...result });
}
