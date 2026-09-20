import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { sweepBroadcasts, sweepWarPresence } from "@/lib/pushJobs";
import {
  ensurePushTables,
  pushConfigured,
  sendPushToAll,
} from "@/lib/pushServer";
import { RateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit";
import { NextResponse, after } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// proxy.ts passes this route through without a session cookie (the installed
// app polls it from /login and from devices whose session expired), so it is
// effectively public — rate-limit per IP like the other public endpoints.
// In-memory like loginRateLimiter: per-isolate best-effort, not the only
// control. 30/5min is ~10x the AppBadgeSync cadence (2 min per open tab),
// so shared-NAT households and multi-device members never hit it.
const statusLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 polls per 5 min per IP
})

// ---------------------------------------------------------------------------
// War badge state — deliberately DB-FREE.
//
// This endpoint used to build the full shared war context (standings, member
// tables, history: a dozen queries). On a cold isolate during a pooler wave
// that build outlived the 60s function cap and Vercel served a 504
// FUNCTION_INVOCATION_TIMEOUT page (reproduced 4x on 20 Sep). The badge only
// needs "is a war on / when does it end", and BIG Games' active-battle API
// answers that in one request. 90s cache on success; on failure keep serving
// the last known state and retry on the next poll (never cache a failure).
// ---------------------------------------------------------------------------
const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const WAR_BADGE_CACHE_MS = 90_000;

type WarBadgeState = {
  active: boolean;
  battleId: string | null;
  endsAt: string | null;
  timeLeftMs: number | null;
};

const WAR_BADGE_INACTIVE: WarBadgeState = {
  active: false,
  battleId: null,
  endsAt: null,
  timeLeftMs: null,
};

let warBadgeCache: { state: WarBadgeState; at: number } | null = null;

function toEpochSeconds(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

async function getWarBadgeState(): Promise<WarBadgeState> {
  if (warBadgeCache && Date.now() - warBadgeCache.at < WAR_BADGE_CACHE_MS) {
    return warBadgeCache.state;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    let payload: { data?: Record<string, unknown> } | null = null;
    try {
      const res = await fetch(ACTIVE_BATTLE_API, {
        cache: "no-store",
        headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
        signal: controller.signal,
      });
      if (res.ok) payload = (await res.json()) as { data?: Record<string, unknown> };
    } finally {
      clearTimeout(timer);
    }

    const data = payload?.data ?? {};
    const config = (data.configData ?? {}) as Record<string, unknown>;
    const start = toEpochSeconds(config.StartTime);
    const finish = toEpochSeconds(config.FinishTime);
    const nowSec = Math.floor(Date.now() / 1000);
    const active = start > 0 && finish > 0
      ? start <= nowSec && nowSec <= finish
      : Boolean(data.activeBattleConfigName ?? data.activeBattleId ?? data.battleId);
    // battleId format matches the shared war context: configData.Title.
    const title = typeof config.Title === "string" && config.Title
      ? config.Title
      : typeof data.configName === "string"
        ? data.configName
        : null;

    const state: WarBadgeState = {
      active,
      battleId: active ? title : null,
      endsAt: finish > 0 ? new Date(finish * 1000).toISOString() : null,
      timeLeftMs: finish > 0 ? Math.max(0, finish * 1000 - Date.now()) : null,
    };
    warBadgeCache = { state, at: Date.now() };
    return state;
  } catch {
    // PS99 unreachable: serve the last known state. Do NOT cache the
    // failure — the next poll retries, so a short hiccup cannot pin a
    // "no war" answer mid-battle.
    return warBadgeCache?.state ?? WAR_BADGE_INACTIVE;
  }
}

// Per-isolate cooldown for the fan-out sweeps below. Installed devices poll
// this route every ~2 min; during a war each poll used to run the full
// sweep chain (4-6 sequential DB round trips) - mostly redundant work that
// stacked extra load on the pooler exactly when it was most fragile. One
// sweep per isolate per minute is plenty for a background mirror.
let lastSweepAt = 0;

// Per-isolate war-announce guard: the INSERT ... DO NOTHING below is the
// cross-instance dedupe, but it still cost one DB round trip on EVERY device
// poll while a war was live. Once this isolate has attempted the announce
// for a battle (won or lost the race), skip it until the next battle.
let lastAnnouncedBattle: string | null = null;

// War-day resilience: ride out pooler episodes (up to 60s) instead of being
// killed at the default cap — a killed function makes Vercel serve its
// plain-text "An error occurred with this application" page, which breaks
// client res.json() parsing.
export const maxDuration = 60;

// Lightweight status polled by the installed app (AppBadgeSync):
//   • warActive drives the 🔴 dot on the home-screen icon (Badging API)
//   • a false→true war edge broadcasts "WAR STARTED" + battle name to all
//     push subscribers, deduped per battle id via app_push_state.
// War data comes from the cached shared context, so this stays cheap even
// with every installed device polling it.
export async function GET(req: Request) {
  const ipLimit = statusLimiter.check(getClientIP(req));
  if (!ipLimit.success) return rateLimitResponse(ipLimit);

  const user = await getAuthenticatedUser().catch(() => null);
  const war = await getWarBadgeState();

  const warActive = war.active;
  const battleId = war.battleId;

  // War-start announce: runs AFTER the response via after(). The INSERT ...
  // DO NOTHING is the cross-instance dedupe (only one poll ever wins), the
  // per-isolate latch stops every poll re-attempting it.
  if (warActive && battleId && battleId !== lastAnnouncedBattle && pushConfigured()) {
    after(async () => {
      try {
        await ensurePushTables();
        const { rows } = await pool.query<{ key: string }>(
          `INSERT INTO app_push_state (key, value)
           VALUES ($1, '{}'::jsonb)
           ON CONFLICT (key) DO NOTHING
           RETURNING key`,
          [`war-push:${battleId}`]
        );
        // Latch AFTER the attempt: if the INSERT itself failed (pooler wave),
        // the next poll retries the announce instead of skipping it forever.
        lastAnnouncedBattle = battleId;
        if (rows.length > 0) {
          const site =
            process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcwv-hub.vercel.app";
          const result = await sendPushToAll(
            {
              title: "WAR STARTED",
              body: String(battleId),
              url: "/war-info",
              tag: `war-${battleId}`.slice(0, 48),
              image: `${site}/og-card.png`,
            },
            { type: "war" }
          );
          if (result.sent) {
            console.log(`[app-status] war-start push sent to ${result.sent} subscribers`);
          }
        }
      } catch {
        // Push is best-effort — never let it break the status endpoint.
      }
    });
  }

  // Fan-out jobs — broadcast mirroring always, presence tracking only while
  // a battle is live. Both are deduped/cooled-down internally, and now run
  // AFTER the response is sent: during pooler waves these sweeps could ride
  // a 30-60s connect ladder and stall every device polling this endpoint.
  if (pushConfigured()) {
    const sweepNow = Date.now();
    if (sweepNow - lastSweepAt > 60_000) {
      lastSweepAt = sweepNow;
      after(async () => {
        await sweepBroadcasts().catch(() => null);
        if (warActive) {
          await sweepWarPresence().catch(() => null);
        }
      });
    }
  }

  return NextResponse.json({
    success: true,
    warActive,
    battleId,
    endsAt: war.endsAt,
    timeLeftMs: war.timeLeftMs,
    pushConfigured: pushConfigured(),
    // The announce now runs after the response, so it can no longer report
    // its send count here; field kept for response-shape compatibility with
    // installed app versions.
    pushSent: 0,
    authenticated: Boolean(user),
  });
}
