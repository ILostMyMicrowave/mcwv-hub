import { NextResponse } from "next/server";
import {
  BIG_GAMES_AUTHORIZE_URL,
  BIG_GAMES_SCOPES,
  bigGamesConfigured,
  bigGamesRedirectUri,
  generatePkcePair,
  generateState,
  savePkceByDiscord,
} from "@/lib/biggames";

export const dynamic = "force-dynamic";

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

  const url = new URL(req.url);
  const discordId = String(url.searchParams.get("discord") ?? "").trim();
  if (!/^\d{15,20}$/.test(discordId)) {
    return NextResponse.json({ error: "Invalid Discord ID." }, { status: 400 });
  }

  const { verifier, challenge } = generatePkcePair();
  const state = generateState();
  await savePkceByDiscord(state, discordId, verifier);

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
