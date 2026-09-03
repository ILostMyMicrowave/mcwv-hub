import { NextResponse } from "next/server";
import { discordOAuthConfigured, snapshotGuildsForUser } from "@/lib/discordGuildCheck";
import { isBotAdminAuthorized, unauthorizedMachineResponse } from "@/lib/machineAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bot-facing: re-scan a user who already authorised Discord OAuth.
// No full guild list is returned - only denylist hits + a count.
export async function POST(request: Request) {
  if (!isBotAdminAuthorized(request)) {
    return unauthorizedMachineResponse();
  }
  if (!discordOAuthConfigured()) {
    return NextResponse.json({ success: false, needAuth: true, error: "Discord OAuth is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const discordId = String(body.discord_id ?? body.discordId ?? "").trim();
    if (!/^\d{15,25}$/.test(discordId)) {
      return NextResponse.json({ success: false, error: "discord_id is required" }, { status: 400 });
    }

    const result = await snapshotGuildsForUser(discordId);
    if (result.needAuth) {
      return NextResponse.json({ success: true, needAuth: true });
    }
    return NextResponse.json({
      success: true,
      needAuth: false,
      status: result.status,
      flaggedHits: result.flaggedHits,
      guildCount: result.guildCount,
      identifiedDiscordId: result.identifiedDiscordId,
    });
  } catch (err) {
    console.error("[internal/discord-guild-check] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Failed to run server check" }, { status: 500 });
  }
}
