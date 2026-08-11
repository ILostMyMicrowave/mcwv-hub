import { NextResponse } from "next/server";
import { botAdminFetch } from "@/lib/botAdminApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVER_ID = "1501608673250640055";
const WIDGET_URL = `https://discord.com/api/guilds/${SERVER_ID}/widget.json`;

// Cache for 30 seconds so we don't hammer Discord on every page load.
let cache: { at: number; data: Record<string, unknown> } | null = null;
const CACHE_MS = 30_000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
    }

    // Fetch the Discord widget data + the bot's total member count in parallel.
    // The bot call is best-effort: if the bot is down or unconfigured we still
    // return the widget data with just the online count.
    const [widgetRes, botStatus] = await Promise.all([
      fetch(WIDGET_URL, {
        headers: { "User-Agent": "MCWV-Hub/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }).catch(() => null),
      botAdminFetch<{ bot?: { users?: number } }>("/admin/status").catch(() => null),
    ]);

    if (!widgetRes || !widgetRes.ok) {
      const status = widgetRes?.status ?? 0;
      return NextResponse.json(
        {
          success: false,
          error: status === 403 ? "Widget is disabled in Discord server settings." : `Discord returned HTTP ${status}`,
          onlineCount: 0,
          totalMembers: botStatus?.bot?.users ?? null,
          serverName: "MCWV Discord",
          inviteUrl: null,
        },
        { status: 200 } // 200 so the client can render the error state gracefully
      );
    }

    const widget = await widgetRes.json();
    const onlineCount = Number(widget.presence_count ?? widget.members?.length ?? 0);
    const totalMembers = botStatus?.bot?.users ?? null;

    const data = {
      success: true,
      serverName: String(widget.name ?? "MCWV Discord"),
      inviteUrl: widget.instant_invite ?? null,
      onlineCount,
      totalMembers,
    };

    cache = { at: Date.now(), data };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not reach Discord", onlineCount: 0, totalMembers: null, serverName: "MCWV Discord", inviteUrl: null },
      { status: 200 }
    );
  }
}
