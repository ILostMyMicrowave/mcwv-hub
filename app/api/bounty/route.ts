/* eslint-disable @typescript-eslint/no-explicit-any -- bounty rows are shaped
   by the bot engine; keep parsing defensive until the schema is battle-proven. */
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// War-day resilience: ride out pooler episodes (up to 60s) instead of
// being killed at the default cap (the Sep 16 hard failures).
export const maxDuration = 60;


declare global {
  // Per-isolate micro-cache for the public board state. Every open tab polls
  // this route every 30s and the payload is identical for all viewers (no
  // session data), so a short shared cache collapses the whole sitewide poll
  // storm to at most a handful of database round trips per minute. The
  // s-maxage edge headers below only help cookie-less requests: logged-in
  // browsers send cookies on same-origin fetches and Vercel never caches
  // those, so this in-memory layer is what actually protects the pooler.
  var _bounty_board_cache: { at: number; payload: unknown } | undefined;
  // Single-flight guard: concurrent cache misses (a burst of pollers waking a
  // fresh isolate) share one database round trip instead of stampeding the
  // pool with the same six queries. Errors are never cached.
  var _bounty_board_inflight: Promise<unknown> | undefined;
}

const BOARD_CACHE_TTL_MS = 10_000;
const BOARD_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30",
} as const;

/**
 * Public Bounty Hunt state. Contains NO secret data: targets and hunter
 * assignments never leave the server here (they are only ever returned by
 * /api/bounty/me for the signed-in entrant's own row). Safe to edge-cache.
 */
export async function GET() {
  const cached = global._bounty_board_cache;
  if (cached && Date.now() - cached.at < BOARD_CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, { headers: BOARD_CACHE_HEADERS });
  }

  if (!global._bounty_board_inflight) {
    global._bounty_board_inflight = buildBoardPayload()
      .then((payload) => {
        global._bounty_board_cache = { at: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        global._bounty_board_inflight = undefined;
      });
  }
  const inflight = global._bounty_board_inflight;

  try {
    const payload = await inflight;
    return NextResponse.json(payload, { headers: BOARD_CACHE_HEADERS });
  } catch (err) {
    console.error("[api/bounty] state error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load bounty state" },
      { status: 500 }
    );
  }
}

async function buildBoardPayload(): Promise<unknown> {
  const exists = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.bounty_events') IS NOT NULL AS exists`
  );
  if (!exists.rows[0]?.exists) {
    return {
      success: true,
      event: null,
      entrants: [],
      feed: [],
      rounds: [],
      standings: [],
      updatedAt: new Date().toISOString(),
    };
  }

  // Prefer a live event; fall back to the most recent finished one so the
  // page keeps showing standings after the hunt ends.
  const eventRes = await pool.query<any>(
    `SELECT e.*, b.battle_name
     FROM bounty_events e
     LEFT JOIN battles b ON b.battle_id = e.battle_id
     WHERE e.status IN ('signup', 'active')
     ORDER BY e.id DESC
     LIMIT 1`
  );
  let eventRow = eventRes.rows[0] ?? null;
  if (!eventRow) {
    const fallback = await pool.query<any>(
      `SELECT e.*, b.battle_name
       FROM bounty_events e
       LEFT JOIN battles b ON b.battle_id = e.battle_id
       ORDER BY e.id DESC
       LIMIT 1`
    );
    eventRow = fallback.rows[0] ?? null;
  }

  if (!eventRow) {
    return {
      success: true,
      event: null,
      entrants: [],
      feed: [],
      rounds: [],
      standings: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const eventId = Number(eventRow.id);

  const [entrantsRes, feedRes, roundsRes, countsRes, lastRoundRes] = await Promise.all([
    pool.query<any>(
      `SELECT roblox_id, username, avatar_url, status, eliminated_round, final_place
       FROM bounty_entrants
       WHERE event_id = $1
       ORDER BY (status = 'alive') DESC,
                eliminated_round ASC NULLS LAST,
                LOWER(username) ASC`,
      [eventId]
    ),
    pool.query<any>(
      `SELECT e.roblox_id, e.username, e.avatar_url, e.eliminated_round,
              r.slot_at,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'username', te.username,
                         'avatarUrl', te.avatar_url
                       ) ORDER BY te.roblox_id ASC)
                FROM bounty_targets tt
                LEFT JOIN bounty_entrants te
                  ON te.event_id = tt.event_id
                 AND te.roblox_id = tt.target_roblox_id
                WHERE tt.event_id = e.event_id
                  AND tt.round_no = e.eliminated_round
                  AND tt.hunter_roblox_id = e.roblox_id
              ), '[]'::json) AS lost_to
       FROM bounty_entrants e
       LEFT JOIN bounty_rounds r
         ON r.event_id = e.event_id AND r.round_no = e.eliminated_round
       WHERE e.event_id = $1 AND e.status = 'eliminated'
       ORDER BY e.eliminated_round DESC, e.roblox_id ASC`,
      [eventId]
    ),
    pool.query<any>(
      `SELECT round_no, slot_at, voided, note, eliminated_count
       FROM bounty_rounds
       WHERE event_id = $1
       ORDER BY round_no DESC`,
      [eventId]
    ),
    pool.query<{ alive: string; total: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'alive')::text AS alive,
              COUNT(*)::text AS total
       FROM bounty_entrants
       WHERE event_id = $1`,
      [eventId]
    ),
    pool.query<any>(
      `SELECT slot_at FROM bounty_rounds
       WHERE event_id = $1
       ORDER BY round_no DESC
       LIMIT 1`,
      [eventId]
    ),
  ]);

  const aliveCount = Number(countsRes.rows[0]?.alive ?? 0);
  const entrantsCount = Number(countsRes.rows[0]?.total ?? 0);
  const lastRoundAt = lastRoundRes.rows[0]?.slot_at ?? null;
  const status = String(eventRow.status ?? "signup");

  let winner = null;
  if (status === "ended" && eventRow.winner_roblox_id) {
    const w = entrantsRes.rows.find(
      (r: any) => String(r.roblox_id) === String(eventRow.winner_roblox_id)
    );
    if (w) {
      winner = {
        robloxId: String(w.roblox_id),
        username: String(w.username ?? ""),
        avatarUrl: w.avatar_url ? String(w.avatar_url) : null,
        finalPlace: w.final_place === null || w.final_place === undefined ? null : Number(w.final_place),
      };
    }
  }

  const standings =
    status === "ended"
      ? entrantsRes.rows
          .filter((r: any) => r.final_place !== null && r.final_place !== undefined)
          .sort((a: any, b: any) => Number(a.final_place) - Number(b.final_place))
          .map((r: any) => ({
            robloxId: String(r.roblox_id),
            username: String(r.username ?? ""),
            avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
            finalPlace: Number(r.final_place),
            eliminatedRound: r.eliminated_round === null || r.eliminated_round === undefined ? null : Number(r.eliminated_round),
          }))
      : [];

  // The engine closes a round whenever a new hourly slot lands, so the next
  // checkpoint is ~1h after the last one.
  const nextRoundAt =
    status === "active" && lastRoundAt
      ? new Date(new Date(lastRoundAt).getTime() + 60 * 60 * 1000).toISOString()
      : null;

  return {
    success: true,
    event: {
      id: eventId,
      status,
      battleId: eventRow.battle_id ? String(eventRow.battle_id) : null,
      battleName: eventRow.battle_name ? String(eventRow.battle_name) : null,
      signupCap: Number(eventRow.signup_cap ?? 75),
      entrantsCount,
      aliveCount,
      eliminatedCount: entrantsCount - aliveCount,
      roundCount: Number(eventRow.round_count ?? 0),
      startedAt: eventRow.started_at ? new Date(eventRow.started_at).toISOString() : null,
      endedAt: eventRow.ended_at ? new Date(eventRow.ended_at).toISOString() : null,
      nextRoundAt,
      lastRoundAt: lastRoundAt ? new Date(lastRoundAt).toISOString() : null,
      prize: {
        title: eventRow.prize_title ? String(eventRow.prize_title) : null,
        body: eventRow.prize_body ? String(eventRow.prize_body) : null,
        imageUrl: eventRow.prize_image_url ? String(eventRow.prize_image_url) : null,
      },
      winner,
      endNote: eventRow.end_note ? String(eventRow.end_note) : null,
    },
    entrants: entrantsRes.rows.map((r: any) => ({
      robloxId: String(r.roblox_id),
      username: String(r.username ?? ""),
      avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      status: String(r.status ?? "alive"),
      eliminatedRound: r.eliminated_round === null || r.eliminated_round === undefined ? null : Number(r.eliminated_round),
      finalPlace: r.final_place === null || r.final_place === undefined ? null : Number(r.final_place),
    })),
    feed: feedRes.rows.map((r: any) => ({
      robloxId: String(r.roblox_id),
      username: String(r.username ?? ""),
      avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      round: r.eliminated_round === null || r.eliminated_round === undefined ? null : Number(r.eliminated_round),
      lostTo: Array.isArray(r.lost_to)
        ? r.lost_to.map((x: any) => ({
            username: String(x?.username ?? ""),
            avatarUrl: x?.avatarUrl ?? null,
          }))
        : [],
      at: r.slot_at ? new Date(r.slot_at).toISOString() : null,
    })),
    rounds: roundsRes.rows.map((r: any) => ({
      roundNo: Number(r.round_no),
      voided: Boolean(r.voided),
      note: r.note ? String(r.note) : null,
      eliminatedCount: Number(r.eliminated_count ?? 0),
      at: r.slot_at ? new Date(r.slot_at).toISOString() : null,
    })),
    standings,
    updatedAt: new Date().toISOString(),
  };
}
