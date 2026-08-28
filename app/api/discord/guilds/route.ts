import { NextResponse } from "next/server";
import { RateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit";
import {
  attachOAuthState,
  discordGuildsRedirectUri,
  discordOAuthConfigured,
  DISCORD_AUTHORIZE_URL,
  DISCORD_GUILD_SCOPES,
  generateOAuthState,
  getCheckByToken,
  isCheckExpired,
  markCheckExpired,
} from "@/lib/discordGuildCheck";

export const dynamic = "force-dynamic";

const ipLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const tokenLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 8 });

// Staff-started, applicant-opened Discord OAuth. No hub account.
//   /api/discord/guilds?t=<one-shot token>
export async function GET(req: Request) {
  if (!discordOAuthConfigured()) {
    return NextResponse.json(
      { error: "Discord OAuth is not configured on the hub." },
      { status: 503 }
    );
  }

  const ip = getClientIP(req);
  const ipLimit = ipLimiter.check(ip);
  if (!ipLimit.success) return rateLimitResponse(ipLimit);

  const url = new URL(req.url);
  const token = String(url.searchParams.get("t") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    return NextResponse.json({ error: "Invalid or missing check link." }, { status: 400 });
  }

  const tLimit = tokenLimiter.check(`guildcheck:${token}`);
  if (!tLimit.success) return rateLimitResponse(tLimit);

  const row = await getCheckByToken(token);
  if (!row) {
    return NextResponse.json({ error: "This check link is invalid." }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.redirect(
      new URL(
        row.status === "declined"
          ? "/check-done?error=This check was declined."
          : "/check-done?ok=This check is already finished. You can close this tab.",
        process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app"
      )
    );
  }
  if (isCheckExpired(row)) {
    await markCheckExpired(token);
    return NextResponse.redirect(
      new URL(
        "/check-done?error=This check link expired. Ask staff for a new one.",
        process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app"
      )
    );
  }

  const state = generateOAuthState();
  await attachOAuthState(token, state);

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: discordGuildsRedirectUri(),
    response_type: "code",
    scope: DISCORD_GUILD_SCOPES,
    state,
    prompt: "consent",
  });

  return NextResponse.redirect(`${DISCORD_AUTHORIZE_URL}?${params.toString()}`);
}
