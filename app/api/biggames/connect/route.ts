import { NextResponse } from "next/server";
import {
  BIG_GAMES_AUTHORIZE_URL,
  BIG_GAMES_SCOPES,
  bigGamesConfigured,
  bigGamesRedirectUri,
  generatePkcePair,
  generateState,
  savePkceByDiscord,
} from "@/lib/biggames";e
import { RateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Rate-limit the no-login applicant connect endpoint so it can't be spammed to
// burn BIG Games auth redirects or flood the PKCE table. We limit both per-IP
// and per-discord-id to block automated abuse while letting legit applicants
// through.
const connectLimiter = new RateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 connect attempts per 10 min per IP
});
const discordLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 per hour per discord id
});

// No-login connect for APPLICANTS who don't have a hub account (and shouldn't
// create one). The bot DMs this link to someone who needs to authorise the app
// before applying:
//
//   /api/biggames/connect?discord=<discord_id>
//
// The consent happens on BIG Games' own screen; the resulting token is stored
// keyed by Discord ID (see big_games_discord_tokens) so the bot can verify the
// applicant without any hub account.
export async function GET(req: Request) {
  if (!bigGamesConfigured()) {
    return NextResponse.json({ error: "BIG Games OAuth is not configured." }, { status: 503 });
  }

  // Per-IP rate limit (blocks spam / automated abuse).
  const ip = getClientIP(req);
  const ipLimit = connectLimiter.check(ip);
  if (!ipLimit.success) return rateLimitResponse(ipLimit);

  const url = new URL(req.url);
  const discordId = String(url.searchParams.get("discord") ?? "").trim();
  if (!/^\d{15,20}$/.test(discordId)) {
    return NextResponse.json({ error: "Invalid Discord ID." }, { status: 400 });
  }

  // Per-discord rate limit (blocks repeat abuse against a specific ID).
  const dLimit = discordLimiter.check(`discord:${discordId}`);
  if (!dLimit.success) return rateLimitResponse(dLimit);

  const { verifier, challenge } = generatePkcePair();
  const state = generateState();
  try {
    await savePkceByDiscord(state, discordId, verifier);
  } catch (err) {
    console.error("[biggames/connect] DB save failed:", err);
    return NextResponse.json(
      { error: "Could not prepare authorization. The database is busy. Try again in 30 seconds." },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }

  const redirectUri = bigGamesRedirectUri();
  const params = new URLSearchParams({
    client_id: process.env.BIG_GAMES_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: BIG_GAMES_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  return NextResponse.redirect(`${BIG_GAMES_AUTHORIZE_URL}?${params.toString()}`);
}


