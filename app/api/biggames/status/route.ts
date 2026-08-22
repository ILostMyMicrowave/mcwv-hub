import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { bigGamesConfigured, getValidatedTokenStatus } from "@/lib/biggames";

export const dynamic = "force-dynamic";

// Short in-memory cache so the (serverless) profile page doesn't hammer the
// BIG Games API on every render. Keyed by hub user_id; the connected flag can
// be at most STATUS_CACHE_MS stale, which is fine — actual revokes are caught
// by the bot's revoke monitor and the disconnect route clears the row (and
// this cache) immediately.
//
// Stored on `global` so the disconnect route in the same isolate can reach the
// exact same Map and clear a just-disconnected user instantly.
const STATUS_CACHE_MS = 30_000;
declare global {
  var _biggamesStatusCache: Map<string, { at: number; payload: any }> | undefined;
}
const statusCache = (global._biggamesStatusCache ??= new Map());

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const key = String(auth.user.id);
  const cached = statusCache.get(key);
  if (cached && Date.now() - cached.at < STATUS_CACHE_MS) {
    return NextResponse.json(cached.payload);
  }

  const status = await getValidatedTokenStatus(auth.user.id);
  const payload = {
    success: true,
    configured: bigGamesConfigured(),
    connected: Boolean(status),
    status,
  };
  statusCache.set(key, { at: Date.now(), payload });
  return NextResponse.json(payload);
}
