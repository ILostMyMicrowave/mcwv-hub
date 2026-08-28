import { NextResponse } from "next/server";
import {
  checkDoneRedirect,
  completeCheck,
  discordGuildsRedirectUri,
  discordOAuthConfigured,
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordIdentity,
  getCheckByOAuthState,
  getCheckDenylist,
  intersectDenylist,
  isCheckExpired,
  markCheckExpired,
  revokeDiscordToken,
} from "@/lib/discordGuildCheck";

export const dynamic = "force-dynamic";

function redirectDone(message: string, isError: boolean) {
  return NextResponse.redirect(checkDoneRedirect(message, isError));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (!discordOAuthConfigured()) {
    return redirectDone("Discord OAuth is not configured.", true);
  }

  const row = state ? await getCheckByOAuthState(state) : null;

  if (error === "access_denied") {
    if (row && row.status === "pending") {
      await completeCheck(row.token, "declined");
    }
    return redirectDone("You declined the Discord check. You can close this tab.", true);
  }

  if (!code || !state) {
    return redirectDone("Missing OAuth parameters. Ask staff for a fresh link.", true);
  }
  if (!row) {
    return redirectDone("Invalid or expired check. Ask staff for a fresh link.", true);
  }
  if (row.status !== "pending") {
    return redirectDone("This check is already finished. You can close this tab.", false);
  }
  if (isCheckExpired(row)) {
    await markCheckExpired(row.token);
    return redirectDone("This check link expired. Ask staff for a new one.", true);
  }

  let accessToken = "";
  try {
    accessToken = await exchangeDiscordCode(code, discordGuildsRedirectUri());
    const identity = await fetchDiscordIdentity(accessToken);
    if (identity.id !== row.target_discord_id) {
      await completeCheck(row.token, "mismatch", { identifiedDiscordId: identity.id });
      return redirectDone(
        "You signed in with a different Discord account than the one staff asked to check. You can close this tab.",
        true
      );
    }

    const guilds = await fetchDiscordGuilds(accessToken);
    const denylist = await getCheckDenylist();
    const hits = intersectDenylist(guilds, denylist);
    await completeCheck(row.token, hits.length ? "flagged" : "clean", {
      flaggedHits: hits,
      guildCount: guilds.length,
      identifiedDiscordId: identity.id,
    });
    return redirectDone("Done. You can close this tab and go back to Discord.", false);
  } catch (err) {
    console.error("[discord/guilds/callback] error:", err instanceof Error ? err.message : err);
    try {
      if (row.status === "pending") {
        await completeCheck(row.token, "error");
      }
    } catch {
      // ignore
    }
    return redirectDone("Something went wrong finishing the check. Ask staff to try again.", true);
  } finally {
    if (accessToken) {
      await revokeDiscordToken(accessToken);
    }
  }
}
