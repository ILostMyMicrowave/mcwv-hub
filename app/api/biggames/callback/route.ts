import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import {
  bigGamesConfigured,
  bigGamesRedirectUri,
  consumePkce,
  exchangeCode,
  saveAccessToken,
  saveDiscordAccessToken,
} from "@/lib/biggames";

export const dynamic = "force-dynamic";

// OAuth callback. BIG Games redirects here with ?code=...&state=...
// Two flows:
//  1) Applicant flow: the PKCE record is keyed by a Discord ID (no hub account
//     needed). We store the token keyed by Discord ID so the bot can see it.
//  2) Member flow: the PKCE record is keyed by a hub user_id -> requires the
//     hub session, and stores the token against the hub user.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (error === "access_denied") {
    return redirectAfterConnect("You declined access. You can return to Discord and try again.", true);
  }
  if (!code || !state) {
    return redirectAfterConnect("Missing OAuth parameters.", true);
  }

  try {
    if (!bigGamesConfigured()) {
      throw new Error("BIG Games OAuth not configured.");
    }

    const record = await consumePkce(state);
    if (!record) {
      return redirectAfterConnect("Invalid or expired OAuth link. Please get a fresh one from the bot.", true);
    }

    const token = await exchangeCode(code, record.code_verifier, bigGamesRedirectUri());
    if (!token.accessToken) {
      return redirectAfterConnect("Failed to obtain access token.", true);
    }

    // Optionally resolve the linked Roblox id from the account profile.
    let robloxId: string | null = null;
    try {
      const res = await fetch("https://ps99.biggamesapi.io/v1/account/profile", {
        headers: { Authorization: `Bearer ${token.accessToken}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      robloxId = json?.data?.robloxUserId
        ? String(json.data.robloxUserId)
        : json?.data?.account?.robloxUserId
          ? String(json.data.account.robloxUserId)
          : null;
    } catch {
      robloxId = null;
    }

    // Applicant flow (keyed by Discord ID) — no hub session required.
    if (record.discord_id) {
      await saveDiscordAccessToken(record.discord_id, token.accessToken, token.scope, robloxId);
      return redirectAfterConnect(
        "Connected to BIG Games! You can now return to Discord and open your application.",
        false
      );
    }

    // Member flow (keyed by hub user_id) — requires the hub session.
    if (!session.user?.id) {
      return redirectToProfile("Please sign in to the hub, then connect again.", true);
    }
    if (Number(record.user_id) !== Number(session.user.id)) {
      return redirectToProfile("OAuth session mismatch. Please try again.", true);
    }
    await saveAccessToken(Number(session.user.id), token.accessToken, token.scope, robloxId);
    return redirectToProfile("Connected to BIG Games!", false);
  } catch (err) {
    console.error("[biggames/callback] error:", err);
    return redirectAfterConnect(
      err instanceof Error ? err.message : "Failed to connect BIG Games.",
      true
    );
  }
}

function redirectToProfile(msg: string, isError: boolean) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app";
  const url = new URL("/profile/me", base);
  url.searchParams.set(isError ? "bg_error" : "bg_success", msg);
  return NextResponse.redirect(url);
}

// Applicant flow has no hub account, so land them on a small public page that
// just confirms the connection (no login required).
function redirectAfterConnect(msg: string, isError: boolean) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app";
  const url = new URL("/connect-success", base);
  url.searchParams.set(isError ? "bg_error" : "bg_success", msg);
  return NextResponse.redirect(url);
}
