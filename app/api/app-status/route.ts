import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { getSharedWarContext } from "@/lib/warContext";
import { sweepBroadcasts, sweepWarPresence } from "@/lib/pushJobs";
import {
  ensurePushTables,
  pushConfigured,
  sendPushToAll,
} from "@/lib/pushServer";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lightweight status polled by the installed app (AppBadgeSync):
//   • warActive drives the 🔴 dot on the home-screen icon (Badging API)
//   • a false→true war edge broadcasts "WAR STARTED" + battle name to all
//     push subscribers, deduped per battle id via app_push_state.
// War data comes from the cached shared context, so this stays cheap even
// with every installed device polling it.
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  const war = await getSharedWarContext().catch(() => null);

  const warActive = Boolean(war?.active);
  const battleId = war?.battleId ?? null;

  let pushSent = 0;
  if (warActive && battleId && pushConfigured()) {
    try {
      await ensurePushTables();
      // First time we see this battle id → announce it. The INSERT ... DO
      // NOTHING is the dedupe: only one poll wins the race, ever.
      const { rows } = await pool.query<{ key: string }>(
        `INSERT INTO app_push_state (key, value)
         VALUES ($1, '{}'::jsonb)
         ON CONFLICT (key) DO NOTHING
         RETURNING key`,
        [`war-push:${battleId}`]
      );
      if (rows.length > 0) {
        const site =
          process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcwv-hub.vercel.app";
        const result = await sendPushToAll(
          {
            title: "WAR STARTED",
            body: String(battleId),
            url: "/war-info",
            tag: `war-${battleId}`.slice(0, 48),
            image: `${site}/og-card.png`,
          },
          { type: "war" }
        );
        pushSent = result.sent;
      }
    } catch {
      // Push is best-effort — never let it break the status endpoint.
    }
  }

  // Fan-out jobs — broadcast mirroring always, presence tracking only while
  // a battle is live. Both are deduped/cooled-down internally.
  if (pushConfigured()) {
    await sweepBroadcasts().catch(() => null);
    if (warActive) {
      await sweepWarPresence().catch(() => null);
    }
  }

  return NextResponse.json({
    success: true,
    warActive,
    battleId,
    endsAt: war?.endsAt ?? null,
    timeLeftMs: war?.timeLeftMs ?? null,
    pushConfigured: pushConfigured(),
    pushSent,
    authenticated: Boolean(user),
  });
}
