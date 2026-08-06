import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { getSharedWarContext } from "@/lib/warContext";
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
//   • a false→true war edge broadcasts "⚔️ WAR DECLARED" to all push
//     subscribers, deduped per battle id via app_push_state.
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
        const result = await sendPushToAll({
          title: "⚔️ WAR DECLARED",
          body: `${battleId} is live — MCWV, to arms!`,
          url: "/war-info",
          tag: `war-${battleId}`.slice(0, 48),
        });
        pushSent = result.sent;
      }
    } catch {
      // Push is best-effort — never let it break the status endpoint.
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
