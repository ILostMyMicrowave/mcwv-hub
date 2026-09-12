import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { GET as getStatus } from "../status/route";
import { GET as getPlayers } from "../players/route";
import { GET as getGiveaways } from "../giveaways/route";
import { GET as getInvites } from "../invites/route";
import { GET as getTickets } from "../tickets/route";
import { GET as getLogs } from "../logs/route";
import { GET as getChannels } from "../channels/route";
import { GET as getRoles } from "../roles/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * One request for everything the admin panel needs on load.
 *
 * Before this, /admin fired 8 parallel fetches at 8 SEPARATE Vercel functions.
 * On the free tier each cold start costs ~0.5–2 s, and every function that
 * touches the DB also pays a fresh pooler connection — so the panel waited on
 * the slowest of 8 cold isolates (typically 4–10 s, worst case ~15 s).
 *
 * Here all 8 sources run in ONE isolate: one cold start, one shared DB pool
 * (status + players + logs share it), and the 5 bot-proxy calls overlap in
 * parallel. The existing handlers are reused verbatim (including their own
 * auth checks), so behaviour is identical — only the number of cold starts
 * and round-trips drops.
 */
// Each section carries its own ok flag so the client can skip a failed
// section exactly like it did when fetching the routes individually (keep
// whatever data it already had instead of rendering an empty state).
type Section = { ok: boolean; payload: unknown };

async function sectionOf(res: Response): Promise<Section> {
  try {
    return { ok: res.ok, payload: await res.json() };
  } catch {
    return { ok: false, payload: null };
  }
}

export async function GET() {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  const [statusRes, playersRes, giveawaysRes, invitesRes, ticketsRes, logsRes, channelsRes, rolesRes] =
    await Promise.all([
      getStatus(),
      getPlayers(),
      getGiveaways(),
      getInvites(),
      getTickets(),
      // logs reads ?limit= from the URL; no param = default 500, same as the
      // admin page's previous direct fetch.
      getLogs(new Request("http://internal/api/admin/logs")),
      getChannels(),
      getRoles(),
    ]);

  return NextResponse.json({
    success: true,
    status: await sectionOf(statusRes),
    players: await sectionOf(playersRes),
    giveaways: await sectionOf(giveawaysRes),
    invites: await sectionOf(invitesRes),
    tickets: await sectionOf(ticketsRes),
    logs: await sectionOf(logsRes),
    channels: await sectionOf(channelsRes),
    roles: await sectionOf(rolesRes),
  });
}
