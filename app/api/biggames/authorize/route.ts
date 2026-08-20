import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import {
  BIG_GAMES_AUTHORIZE_URL,
  BIG_GAMES_SCOPES,
  bigGamesConfigured,
  bigGamesRedirectUri,
  generatePkcePair,
  generateState,
  savePkce,
} from "@/lib/biggames";

// Starts the OAuth flow: generates a PKCE pair + state, stores the verifier,
// and 302-redirects the player to BIG Games' consent screen.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  if (!bigGamesConfigured()) {
    return NextResponse.json(
      { error: "BIG Games OAuth is not configured (missing client id/secret)." },
      { status: 503 }
    );
  }

  const { verifier, challenge } = generatePkcePair();
  const state = generateState();
  await savePkce(state, auth.user.id, verifier);

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
