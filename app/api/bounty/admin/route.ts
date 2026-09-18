/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_CAP = 3;
const MAX_CAP = 200;
const MIN_ENTRANTS_TO_START = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Thrown for expected, officer-facing rejections so they surface as a 400
 *  with a readable message instead of the generic 500. */
class OfficerError extends Error {}

/** Officer panel state: current event, full roster, pickable battles, the
 *  live war (if any) and the recent staff action feed. */
export async function GET() {
  const gate = await requireAdminUser("officer");
  if (!gate.ok) return gate.response;

  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.bounty_events') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) {
      const battles = await listBattles();
      return NextResponse.json({
        success: true,
        event: null,
        battles,
        entrants: [],
        eliminated: [],
        entrantsCount: 0,
        warLive: liveBattleOf(battles),
        minEntrants: MIN_ENTRANTS_TO_START,
        recent: [],
      });
    }

    const eventRes = await pool.query<any>(
      `SELECT e.*, b.battle_name, b.start_time AS battle_start, b.end_time AS battle_end,
              w.username AS winner_username, w.avatar_url AS winner_avatar,
              (SELECT COUNT(*) FROM bounty_entrants x WHERE x.event_id = e.id)::int AS entrants_count,
              (SELECT COUNT(*) FROM bounty_entrants x WHERE x.event_id = e.id AND x.status = 'alive')::int AS alive_count,
              (SELECT COUNT(*) FROM bounty_entrants x WHERE x.event_id = e.id AND x.status = 'eliminated')::int AS eliminated_count
       FROM bounty_events e
       LEFT JOIN battles b ON b.battle_id = e.battle_id
       LEFT JOIN bounty_entrants w ON w.event_id = e.id AND w.roblox_id = e.winner_roblox_id
       ORDER BY e.id DESC
       LIMIT 1`
    );
    const eventRow = eventRes.rows[0] ?? null;

    let entrants: any[] = [];
    if (eventRow) {
      const entrantsRes = await pool.query<any>(
        `SELECT roblox_id, username, avatar_url, status, eliminated_round, final_place, revived_count, joined_at
         FROM bounty_entrants
         WHERE event_id = $1
         ORDER BY (status = 'alive') DESC, eliminated_round DESC NULLS LAST, joined_at ASC`,
        [eventRow.id]
      );
      entrants = entrantsRes.rows.map((r: any) => ({
        robloxId: String(r.roblox_id),
        username: String(r.username ?? ""),
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        status: String(r.status ?? "alive"),
        eliminatedRound: r.eliminated_round === null || r.eliminated_round === undefined ? null : Number(r.eliminated_round),
        finalPlace: r.final_place === null || r.final_place === undefined ? null : Number(r.final_place),
        revivedCount: Number(r.revived_count ?? 0),
        joinedAt: r.joined_at ? new Date(r.joined_at).toISOString() : null,
      }));
    }

    const battles = await listBattles();
    return NextResponse.json({
      success: true,
      event: eventRow
        ? {
            id: Number(eventRow.id),
            status: String(eventRow.status),
            battleId: eventRow.battle_id ? String(eventRow.battle_id) : null,
            battleName: eventRow.battle_name ? String(eventRow.battle_name) : null,
            battleStart: eventRow.battle_start ? new Date(eventRow.battle_start).toISOString() : null,
            battleEnd: eventRow.battle_end ? new Date(eventRow.battle_end).toISOString() : null,
            signupCap: Number(eventRow.signup_cap ?? 75),
            entrantsCount: Number(eventRow.entrants_count ?? 0),
            aliveCount: Number(eventRow.alive_count ?? 0),
            eliminatedCount: Number(eventRow.eliminated_count ?? 0),
            roundCount: Number(eventRow.round_count ?? 0),
            startedAt: eventRow.started_at ? new Date(eventRow.started_at).toISOString() : null,
            endedAt: eventRow.ended_at ? new Date(eventRow.ended_at).toISOString() : null,
            endNote: eventRow.end_note ? String(eventRow.end_note) : null,
            prize: {
              title: eventRow.prize_title ? String(eventRow.prize_title) : null,
              body: eventRow.prize_body ? String(eventRow.prize_body) : null,
              imageUrl: eventRow.prize_image_url ? String(eventRow.prize_image_url) : null,
            },
            winner: eventRow.winner_roblox_id
              ? {
                  robloxId: String(eventRow.winner_roblox_id),
                  username: eventRow.winner_username ? String(eventRow.winner_username) : "Hunter",
                  avatarUrl: eventRow.winner_avatar ? String(eventRow.winner_avatar) : null,
                }
              : null,
          }
        : null,
      battles,
      entrants,
      eliminated: entrants
        .filter((x) => x.status === "eliminated")
        .map((x) => ({ robloxId: x.robloxId, username: x.username, eliminatedRound: x.eliminatedRound })),
      entrantsCount: eventRow ? Number(eventRow.entrants_count ?? 0) : 0,
      warLive: liveBattleOf(battles),
      minEntrants: MIN_ENTRANTS_TO_START,
      recent: await recentBountyActions(),
    });
  } catch (err) {
    console.error("[api/bounty/admin] GET error:", err);
    return NextResponse.json({ success: false, error: "Failed to load bounty admin state" }, { status: 500 });
  }
}

type BattleOption = {
  battleId: string;
  battleName: string | null;
  startTime: string | null;
  endTime: string | null;
  active: boolean;
  upcoming: boolean;
};

async function listBattles(): Promise<BattleOption[]> {
  const res = await pool.query<any>(
    `SELECT battle_id, battle_name, start_time, end_time
     FROM battles
     WHERE start_time IS NOT NULL
     ORDER BY start_time DESC
     LIMIT 8`
  );
  const now = Date.now();
  return res.rows.map((r: any) => ({
    battleId: String(r.battle_id ?? ""),
    battleName: r.battle_name ? String(r.battle_name) : null,
    startTime: r.start_time ? new Date(r.start_time).toISOString() : null,
    endTime: r.end_time ? new Date(r.end_time).toISOString() : null,
    active:
      r.start_time && (!r.end_time || new Date(r.end_time).getTime() > now)
        ? new Date(r.start_time).getTime() <= now
        : false,
    upcoming: r.start_time ? new Date(r.start_time).getTime() > now : false,
  }));
}

function liveBattleOf(battles: BattleOption[]): { battleId: string; battleName: string | null } | null {
  const live = battles.find((b) => b.active);
  return live ? { battleId: live.battleId, battleName: live.battleName } : null;
}

/** Auto-pick the battle for a new event: only a LIVE battle is attached
 *  directly. Between wars this returns null = "next war, auto" - the bot
 *  engine claims whichever battle goes live next, so a peacetime-created
 *  event can never attach to a stale battle and die at start. */
async function autoPickBattleId(): Promise<string | null> {
  const battles = await listBattles();
  const active = battles.find((b) => b.active);
  return active?.battleId ?? null;
}

/** A battle may only be pinned while it is live or upcoming. A past battle
 *  can never score another round, and pinning one is exactly how an event
 *  ends up watching a dead war while a live one rages unscored. */
async function validBattleChoice(battleId: string): Promise<boolean> {
  const battles = await listBattles();
  const b = battles.find((x) => x.battleId === battleId);
  return Boolean(b && (b.active || b.upcoming));
}

async function recentBountyActions() {
  try {
    const t = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.admin_logs') IS NOT NULL AS exists`
    );
    if (!t.rows[0]?.exists) return [];
    const res = await pool.query<any>(
      `SELECT action, message, actor_username, created_at
       FROM admin_logs
       WHERE event = 'Bounty Hunt'
       ORDER BY created_at DESC
       LIMIT 6`
    );
    return res.rows.map((r: any) => ({
      action: String(r.action ?? ""),
      message: String(r.message ?? ""),
      actor: r.actor_username ? String(r.actor_username) : null,
      at: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
  } catch {
    return [];
  }
}

function imageMagicOk(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Officer actions. The bot engine owns the game loop; these flip the
 *  documented control fields on bounty_events / bounty_entrants. The one
 *  exception is "end", which ports the engine's own finish placement so a
 *  staff-ended hunt gets exactly the standings an engine-finished one would. */
export async function POST(request: Request) {
  const gate = await requireAdminUser("officer");
  if (!gate.ok) return gate.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const action = String(body?.action ?? "");

  try {
    switch (action) {
      case "create": {
        const existing = await pool.query(
          `SELECT id FROM bounty_events WHERE status IN ('signup', 'active') LIMIT 1`
        );
        if (existing.rows.length) {
          return NextResponse.json({ success: false, error: "A hunt is already open or live" }, { status: 400 });
        }
        const wanted = body.battle_id ? String(body.battle_id).trim() : "";
        let battleId: string | null = null;
        if (wanted) {
          if (!(await validBattleChoice(wanted))) {
            return NextResponse.json(
              { success: false, error: "Only a live or upcoming battle can be pinned. Leave it on auto for the next war." },
              { status: 400 }
            );
          }
          battleId = wanted;
        }
        const cap = Math.min(MAX_CAP, Math.max(MIN_CAP, Number(body.signup_cap ?? 75) || 75));
        const prizeTitle = body.prize_title ? String(body.prize_title).slice(0, 120) : null;
        const prizeBody = body.prize_body ? String(body.prize_body).slice(0, 600) : null;
        const prizeImageUrl = body.prize_image_url ? String(body.prize_image_url).slice(0, 500) : null;
        const inserted = await pool.query<any>(
          `INSERT INTO bounty_events
             (battle_id, status, signup_cap, prize_title, prize_body, prize_image_url, created_by_discord_id)
           VALUES ($1, 'signup', $2, $3, $4, $5, $6)
           RETURNING id`,
          [battleId, cap, prizeTitle, prizeBody, prizeImageUrl, gate.user.discordId ? BigInt(gate.user.discordId) : null]
        );
        const eventId = Number(inserted.rows[0]?.id);
        await audit(gate.user, "bounty_create", `Created bounty event #${eventId} for ${battleId ?? "next war (auto)"}`, {
          event_id: eventId,
          battle_id: battleId,
          signup_cap: cap,
        });
        return NextResponse.json({ success: true, eventId });
      }

      case "update_prize": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        await pool.query(
          `UPDATE bounty_events
           SET prize_title = COALESCE($2, prize_title),
               prize_body = COALESCE($3, prize_body),
               prize_image_url = CASE WHEN $4 THEN $5 ELSE prize_image_url END,
               updated_at = NOW()
           WHERE id = $1`,
          [
            event.id,
            body.prize_title !== undefined ? (body.prize_title ? String(body.prize_title).slice(0, 120) : null) : null,
            body.prize_body !== undefined ? (body.prize_body ? String(body.prize_body).slice(0, 600) : null) : null,
            body.prize_image_url !== undefined ? true : false,
            body.prize_image_url ? String(body.prize_image_url).slice(0, 500) : null,
          ]
        );
        await audit(gate.user, "bounty_prize", `Updated bounty prize on event #${event.id}`, { event_id: Number(event.id) });
        return NextResponse.json({ success: true });
      }

      case "set_cap": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (String(event.status) !== "signup") {
          return NextResponse.json({ success: false, error: "The cap can only change while sign-up is open" }, { status: 400 });
        }
        const cap = Math.min(MAX_CAP, Math.max(MIN_CAP, Number(body.signup_cap ?? 75) || 75));
        await pool.query(`UPDATE bounty_events SET signup_cap = $2, updated_at = NOW() WHERE id = $1`, [event.id, cap]);
        await audit(gate.user, "bounty_cap", `Set bounty cap to ${cap} on event #${event.id}`, { event_id: Number(event.id), cap });
        return NextResponse.json({ success: true });
      }

      case "start": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (String(event.status) !== "signup") {
          return NextResponse.json({ success: false, error: "The hunt already started or ended" }, { status: 400 });
        }
        const countRes = await pool.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM bounty_entrants WHERE event_id = $1`,
          [event.id]
        );
        const entrantsCount = Number(countRes.rows[0]?.total ?? 0);
        if (entrantsCount < MIN_ENTRANTS_TO_START) {
          return NextResponse.json(
            { success: false, error: `Need at least ${MIN_ENTRANTS_TO_START} hunters to start` },
            { status: 400 }
          );
        }
        await pool.query(
          `UPDATE bounty_events SET status = 'active', started_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'signup'`,
          [event.id]
        );
        await audit(gate.user, "bounty_start", `Started bounty event #${event.id} with ${entrantsCount} hunters`, {
          event_id: Number(event.id),
          entrants: entrantsCount,
        });
        return NextResponse.json({ success: true });
      }

      case "abort": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (!["signup", "active"].includes(String(event.status))) {
          return NextResponse.json({ success: false, error: "The hunt already finished" }, { status: 400 });
        }
        await pool.query(
          `UPDATE bounty_events SET status = 'aborted', ended_at = NOW(), end_note = 'Stopped by staff', updated_at = NOW()
           WHERE id = $1 AND status IN ('signup', 'active')`,
          [event.id]
        );
        await audit(gate.user, "bounty_abort", `Aborted bounty event #${event.id}`, { event_id: Number(event.id) });
        return NextResponse.json({ success: true });
      }

      case "revive": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (String(event.status) !== "active") {
          return NextResponse.json({ success: false, error: "Can only revive during a live hunt" }, { status: 400 });
        }
        const robloxId = String(body.roblox_id ?? "").trim();
        if (!robloxId) {
          return NextResponse.json({ success: false, error: "Pick a hunter to revive" }, { status: 400 });
        }
        const updated = await pool.query(
          `UPDATE bounty_entrants
           SET status = 'alive', revived_count = revived_count + 1
           WHERE event_id = $1 AND roblox_id = $2 AND status = 'eliminated'`,
          [event.id, robloxId]
        );
        if (!updated.rowCount) {
          return NextResponse.json({ success: false, error: "That hunter is not eliminated" }, { status: 400 });
        }
        await audit(gate.user, "bounty_revive", `Revived hunter ${robloxId} on event #${event.id}`, {
          event_id: Number(event.id),
          roblox_id: robloxId,
        });
        return NextResponse.json({ success: true });
      }

      case "set_battle": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        const wanted = body.battle_id == null ? "" : String(body.battle_id).trim();
        let target: string | null = null;
        if (wanted) {
          if (!(await validBattleChoice(wanted))) {
            return NextResponse.json({ success: false, error: "That battle is not live or upcoming" }, { status: 400 });
          }
          target = wanted;
        }
        const upd = await pool.query(
          `UPDATE bounty_events
           SET battle_id = $2, updated_at = NOW()
           WHERE id = $1 AND (status = 'signup' OR (status = 'active' AND round_count = 0))`,
          [event.id, target]
        );
        if (!upd.rowCount) {
          return NextResponse.json({ success: false, error: "The battle link locks once the first round closes" }, { status: 400 });
        }
        await audit(gate.user, "bounty_battle", `Linked bounty event #${event.id} to ${target ?? "next war (auto)"}`, {
          event_id: Number(event.id),
          battle_id: target,
        });
        return NextResponse.json({ success: true });
      }

      case "remove_entrant": {
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (String(event.status) !== "signup") {
          return NextResponse.json({ success: false, error: "Hunters can only be removed while sign-ups are open" }, { status: 400 });
        }
        const robloxId = String(body.roblox_id ?? "").trim();
        if (!robloxId) {
          return NextResponse.json({ success: false, error: "Pick a hunter to remove" }, { status: 400 });
        }
        const nameRes = await pool.query<{ username: string }>(
          `SELECT username FROM bounty_entrants WHERE event_id = $1 AND roblox_id = $2`,
          [event.id, robloxId]
        );
        const del = await pool.query(
          `DELETE FROM bounty_entrants WHERE event_id = $1 AND roblox_id = $2`,
          [event.id, robloxId]
        );
        if (!del.rowCount) {
          return NextResponse.json({ success: false, error: "That hunter is not in this hunt" }, { status: 400 });
        }
        await audit(gate.user, "bounty_remove", `Removed ${nameRes.rows[0]?.username ?? robloxId} from bounty event #${event.id}`, {
          event_id: Number(event.id),
          roblox_id: robloxId,
        });
        return NextResponse.json({ success: true });
      }

      case "eliminate": {
        if (gate.user.role !== "owner") {
          return NextResponse.json({ success: false, error: "Only the owner can strike a hunter" }, { status: 403 });
        }
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (String(event.status) !== "active") {
          return NextResponse.json({ success: false, error: "A manual strike only lands while the hunt is live" }, { status: 400 });
        }
        const robloxId = String(body.roblox_id ?? "").trim();
        if (!robloxId) {
          return NextResponse.json({ success: false, error: "Pick a hunter to strike" }, { status: 400 });
        }
        // eliminated_round = the round about to close, matching the engine's
        // own numbering so the kill feed and standings stay consistent.
        const upd = await pool.query(
          `UPDATE bounty_entrants
           SET status = 'eliminated',
               eliminated_round = (SELECT round_count + 1 FROM bounty_events WHERE id = $1)
           WHERE event_id = $1 AND roblox_id = $2 AND status = 'alive'`,
          [event.id, robloxId]
        );
        if (!upd.rowCount) {
          return NextResponse.json({ success: false, error: "That hunter is not alive" }, { status: 400 });
        }
        await audit(gate.user, "bounty_eliminate", `Manually eliminated hunter ${robloxId} on event #${event.id}`, {
          event_id: Number(event.id),
          roblox_id: robloxId,
        });
        return NextResponse.json({ success: true });
      }

      case "end": {
        if (gate.user.role !== "owner") {
          return NextResponse.json({ success: false, error: "Only the owner can end a hunt" }, { status: 403 });
        }
        const event = await latestEventRow();
        if (!event) return failNoEvent();
        if (String(event.status) !== "active") {
          return NextResponse.json({ success: false, error: "Only a live hunt can be ended" }, { status: 400 });
        }
        const mode = body.mode === "tiebreak" ? "tiebreak" : "pick";
        const note = body.note ? String(body.note).slice(0, 200) : null;

        let winnerName: string | null = null;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const evRes = await client.query<any>(
            `SELECT id, status, battle_id FROM bounty_events WHERE id = $1 FOR UPDATE`,
            [event.id]
          );
          const fresh = evRes.rows[0];
          if (!fresh || String(fresh.status) !== "active") {
            throw new OfficerError("The hunt is not live");
          }

          let winnerId: string | null = null;
          if (mode === "pick") {
            winnerId = String(body.winner_roblox_id ?? "").trim() || null;
            if (!winnerId) throw new OfficerError("Pick a winner first");
            const aliveRes = await client.query(
              `SELECT 1 FROM bounty_entrants WHERE event_id = $1 AND roblox_id = $2 AND status = 'alive'`,
              [event.id, winnerId]
            );
            if (!aliveRes.rowCount) throw new OfficerError("That hunter is not alive");
          } else {
            // Tiebreak, ported 1:1 from the bot engine's tiebreak winner:
            // best final-round PPH, then total points, then the latest hourly
            // snapshot as a no-rounds fallback.
            const byPph = await client.query<{ roblox_id: string }>(
              `SELECT p.roblox_id
               FROM bounty_round_pph p
               WHERE p.event_id = $1
                 AND p.round_no = (SELECT MAX(round_no) FROM bounty_rounds WHERE event_id = $1 AND voided = FALSE)
               ORDER BY p.pph DESC, p.points DESC, p.roblox_id ASC
               LIMIT 1`,
              [event.id]
            );
            if (byPph.rows[0]) {
              winnerId = String(byPph.rows[0].roblox_id);
            } else if (fresh.battle_id) {
              const byPoints = await client.query<{ roblox_id: string }>(
                `SELECT e.roblox_id
                 FROM bounty_entrants e
                 LEFT JOIN LATERAL (
                   SELECT s.points AS points
                   FROM hourly_stats_player_snapshots s
                   WHERE s.battle_id = regexp_replace(lower($2), '[^a-z0-9]+', '', 'g')
                     AND s.roblox_id = e.roblox_id
                   ORDER BY s.scheduled_at DESC
                   LIMIT 1
                 ) s ON TRUE
                 WHERE e.event_id = $1 AND e.status = 'alive'
                 ORDER BY COALESCE(s.points, 0) DESC, e.roblox_id ASC
                 LIMIT 1`,
                [event.id, String(fresh.battle_id)]
              );
              if (byPoints.rows[0]) winnerId = String(byPoints.rows[0].roblox_id);
            }
          }

          // Final places, ported from the engine's finish routine: winner
          // takes 1st, survivors place 2..k by final-round PPH then total
          // points, eliminated hunters follow by later survival then weaker
          // PPH. A no-winner end starts the survivors at 1st.
          if (winnerId) {
            await client.query(
              `UPDATE bounty_entrants SET final_place = 1 WHERE event_id = $1 AND roblox_id = $2`,
              [event.id, winnerId]
            );
          }
          const survivors = await client.query(
            `UPDATE bounty_entrants e SET final_place = q.place
             FROM (
               SELECT e2.roblox_id,
                      ROW_NUMBER() OVER (
                        ORDER BY COALESCE(p.pph, -1) DESC, COALESCE(p.points, -1) DESC, e2.roblox_id ASC
                      ) + $3 AS place
               FROM bounty_entrants e2
               LEFT JOIN bounty_round_pph p
                 ON p.event_id = e2.event_id AND p.roblox_id = e2.roblox_id
                AND p.round_no = (SELECT MAX(round_no) FROM bounty_rounds WHERE event_id = e2.event_id AND voided = FALSE)
               WHERE e2.event_id = $1 AND e2.status = 'alive' AND e2.roblox_id IS DISTINCT FROM $2
             ) q
             WHERE e.event_id = $1 AND e.roblox_id = q.roblox_id
             RETURNING e.roblox_id`,
            [event.id, winnerId, winnerId ? 1 : 0]
          );
          await client.query(
            `UPDATE bounty_entrants e SET final_place = q.place
             FROM (
               SELECT e2.roblox_id,
                      ROW_NUMBER() OVER (
                        ORDER BY e2.eliminated_round DESC, COALESCE(p.pph, -1) ASC, e2.roblox_id ASC
                      ) + $3 AS place
               FROM bounty_entrants e2
               LEFT JOIN bounty_round_pph p
                 ON p.event_id = e2.event_id AND p.roblox_id = e2.roblox_id
                AND p.round_no = e2.eliminated_round
               WHERE e2.event_id = $1 AND e2.status = 'eliminated'
             ) q
             WHERE e.event_id = $1 AND e.roblox_id = q.roblox_id`,
            [event.id, (winnerId ? 1 : 0) + (survivors.rowCount ?? 0)]
          );
          const fin = await client.query(
            `UPDATE bounty_events
             SET status = 'ended', ended_at = NOW(), updated_at = NOW(),
                 winner_roblox_id = $2, end_note = COALESCE($3, end_note)
             WHERE id = $1 AND status = 'active'`,
            [event.id, winnerId, note]
          );
          if (!fin.rowCount) throw new OfficerError("The hunt is not live");

          if (winnerId) {
            const w = await client.query<{ username: string }>(
              `SELECT username FROM bounty_entrants WHERE event_id = $1 AND roblox_id = $2`,
              [event.id, winnerId]
            );
            winnerName = w.rows[0]?.username ?? null;
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          if (err instanceof OfficerError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 400 });
          }
          console.error("[api/bounty/admin] end error:", err);
          return NextResponse.json({ success: false, error: "Could not end the hunt" }, { status: 500 });
        } finally {
          client.release();
        }
        await audit(
          gate.user,
          "bounty_end",
          `Ended bounty event #${event.id}${winnerName ? ` - winner ${winnerName}` : " - no winner"}`,
          { event_id: Number(event.id), mode, winner: winnerName }
        );
        return NextResponse.json({ success: true, winner: winnerName });
      }

      case "upload_prize_image": {
        const dataUrl = String(body.data_url ?? "");
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
        if (!match) {
          return NextResponse.json({ success: false, error: "Provide a PNG, JPEG or WebP image" }, { status: 400 });
        }
        const buffer = Buffer.from(match[2], "base64");
        if (buffer.length <= 0 || buffer.length > MAX_IMAGE_BYTES) {
          return NextResponse.json({ success: false, error: "Image must be under 2MB" }, { status: 400 });
        }
        const detected = imageMagicOk(buffer);
        if (!detected || detected !== match[1]) {
          return NextResponse.json({ success: false, error: "That file is not the image type it claims to be" }, { status: 400 });
        }
        const id = randomUUID();
        await pool.query(
          `CREATE TABLE IF NOT EXISTS hub_media (
             id TEXT PRIMARY KEY,
             content_type TEXT NOT NULL,
             bytes BYTEA NOT NULL,
             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
           )`
        );
        await pool.query(`INSERT INTO hub_media (id, content_type, bytes) VALUES ($1, $2, $3)`, [id, detected, buffer]);
        const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcwv-hub.vercel.app").replace(/\/$/, "");
        const url = `${site}/api/media/${id}`;
        await audit(gate.user, "bounty_prize_image", `Uploaded bounty prize image ${id}`, { media_id: id });
        return NextResponse.json({ success: true, url });
      }

      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("[api/bounty/admin] POST error:", err);
    return NextResponse.json({ success: false, error: "Action failed" }, { status: 500 });
  }
}

async function latestEventRow() {
  const res = await pool.query<any>(
    `SELECT id, status FROM bounty_events ORDER BY id DESC LIMIT 1`
  );
  return res.rows[0] ?? null;
}

function failNoEvent() {
  return NextResponse.json({ success: false, error: "No bounty event exists yet" }, { status: 400 });
}

async function audit(
  user: { id: number; username: string; role: string },
  action: string,
  message: string,
  metadata: Record<string, unknown>
) {
  await logAdminAction({
    event: "Bounty Hunt",
    message,
    action,
    actor: user as never,
    metadata,
  }).catch(() => {});
}
