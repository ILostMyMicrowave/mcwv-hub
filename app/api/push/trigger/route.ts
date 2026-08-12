import { NextResponse } from "next/server";
import { botAdminFetch, BotAdminApiError } from "@/lib/botAdminApi";
import { ensurePushTables, pushConfigured, sendPushToAll } from "@/lib/pushServer";
import { sweepBroadcasts, sweepWarPresence } from "@/lib/pushJobs";
import { getSharedWarContext } from "@/lib/warContext";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bot-triggered push: the MCWV bot calls this endpoint server-to-server
// (using the shared X-Admin-API-Key) to fire push notifications INSTANTLY
// when an event happens (war start, war end, placement change, etc.) —
// instead of waiting for a device to poll /api/app-status.
//
// Body:
//   { event: "war_start" | "war_end" | "placement" | "sweep", title, body, url, tag, image }
// For "sweep", no payload is needed — just runs the sweep jobs.

type TriggerBody = {
  event?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  image?: string;
};

export async function POST(req: Request) {
  // Auth: same shared secret the bot already uses for admin actions.
  const authHeader = req.headers.get("x-admin-api-key") ?? "";
  const bearer = req.headers.get("authorization") ?? "";
  const provided = authHeader || (bearer.toLowerCase().startsWith("bearer ") ? bearer.split(" ")[1] : "");
  const expected = process.env.BOT_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? "";

  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push not configured (missing VAPID keys)" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as TriggerBody;
  const eventType = String(body.event ?? "").toLowerCase();

  try {
    await ensurePushTables();

    // Sweep mode: just run the sweep jobs and return.
    if (eventType === "sweep") {
      const war = await getSharedWarContext().catch(() => null);
      const warActive = Boolean(war?.active);
      const broadcastResult = await sweepBroadcasts().catch(() => ({ pushed: 0 }));
      let presenceResult = { alerted: 0 };
      if (warActive) {
        presenceResult = await sweepWarPresence().catch(() => ({ alerted: 0 }));
      }
      return NextResponse.json({
        success: true,
        event: "sweep",
        broadcasts: broadcastResult.pushed,
        presence: presenceResult.alerted,
      });
    }

    // Event push: send a notification to all subscribers.
    if (!body.title || !body.body) {
      return NextResponse.json({ error: "title and body are required for event pushes" }, { status: 400 });
    }

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcwv-hub.vercel.app";
    const result = await sendPushToAll(
      {
        title: String(body.title).slice(0, 200),
        body: String(body.body).slice(0, 2000),
        url: body.url ?? "/notifications",
        tag: body.tag ? String(body.tag).slice(0, 48) : `bot-${eventType}-${Date.now()}`.slice(0, 48),
        image: body.image ?? `${site}/og-card.png`,
      },
      { type: "war", audience: "clan" }
    );

    return NextResponse.json({
      success: true,
      event: eventType,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    console.error("[push/trigger] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Push trigger failed" },
      { status: 500 }
    );
  }
}
