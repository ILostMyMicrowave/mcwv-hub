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
} from "@/lib/biggames";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

// OAuth callback. BIG Games redirects here with ?code=...&state=...
// We verify state (CSRF), exchange the code for an access token, store it
// against the hub user, then send them back to their profile.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (error === "access_denied") {
    return redirectToProfile("You declined access. Your profile will keep using public data.", true);
  }

  if (!code || !state) {
    return redirectToProfile("Missing OAuth parameters.", true);
  }

  if (!session.user?.id) {
    // Not signed into the hub during the callback — just bounce to login.
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app")
    );
  }

  try {
    if (!bigGamesConfigured()) {
      throw new Error("BIG Games OAuth not configured.");
    }

    const record = await consumePkce(state);
    if (!record) {
      return redirectToProfile("Invalid or expired OAuth state. Please try again.", true);
    }
    if (Number(record.user_id) !== Number(session.user.id)) {
      return redirectToProfile("OAuth session mismatch. Please try again.", true);
    }

    const token = await exchangeCode(code, record.code_verifier, bigGamesRedirectUri());
    if (!token.accessToken) {
      return redirectToProfile("Failed to obtain access token.", true);
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

    await saveAccessToken(Number(session.user.id), token.accessToken, token.scope, robloxId);
    return redirectToProfile("Connected to BIG Games!", false);
  } catch (err) {
    console.error("[biggames/callback] error:", err);
    return redirectToProfile(
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
