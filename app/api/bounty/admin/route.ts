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

/** Officer panel state: current event, pickable battles, revive list. */
export async function GET() {
  const gate = await requireAdminUser("officer");
  if (!gate.ok) return gate.response;

  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.bounty_events') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) {
      const battles = await listBattles();
      return NextResponse.json({ success: true, event: null, battles, eliminated: [], entrantsCount: 0 });
    }

    const eventRes = await pool.query<any>(
      `SELECT e.*, b.battle_name, b.start_time, b.end_time,
              (SELECT COUNT(*) FROM bounty_entrants x WHERE x.event_id = e.id)::int AS entrants_count
       FROM bounty_events e
       LEFT JOIN battles b ON b.battle_id = e.battle_id
       ORDER BY e.id DESC
       LIMIT 1`
    );
    const eventRow = eventRes.rows[0] ?? null;

    let eliminated: any[] = [];
    if (eventRow) {
      const elimRes = await pool.query<any>(
        `SELECT roblox_id, username, eliminated_round
         FROM bounty_entrants
         WHERE event_id = $1 AND status = 'eliminated'
         ORDER BY eliminated_round DESC, LOWER(username) ASC`,
        [eventRow.id]
      );
      eliminated = elimRes.rows.map((r: any) => ({
        robloxId: String(r.roblox_id),
        username: String(r.username ?? ""),
        eliminatedRound: r.eliminated_round === null || r.eliminated_round === undefined ? null : Number(r.eliminated_round),
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
            signupCap: Number(eventRow.signup_cap ?? 75),
            entrantsCount: Number(eventRow.entrants_count ?? 0),
            roundCount: Number(eventRow.round_count ?? 0),
            prize: {
              title: eventRow.prize_title ? String(eventRow.prize_title) : null,
              body: eventRow.prize_body ? String(eventRow.prize_body) : null,
              imageUrl: eventRow.prize_image_url ? String(eventRow.prize_image_url) : null,
            },
          }
        : null,
      battles,
      eliminated,
      entrantsCount: eventRow ? Number(eventRow.entrants_count ?? 0) : 0,
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

/** Auto-pick the battle for a new event: only a LIVE battle is attached
 *  directly. Between wars this returns null = "next war, auto" - the bot
 *  engine claims whichever battle goes live next, so a peacetime-created
 *  event can never attach to a stale battle and die at start. */
async function autoPickBattleId(): Promise<string | null> {
  const battles = await listBattles();
  const active = battles.find((b) => b.active);
  return active?.battleId ?? null;
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

/** Officer actions. The bot engine owns all game logic; these only flip
 *  the documented control fields on bounty_events / bounty_entrants. */
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
        // Empty battle_id = "next war, auto" (stored as NULL; the engine
        // attaches the live battle the moment a war starts).
        const battleId = body.battle_id ? String(body.battle_id) : await autoPickBattleId();
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
        await audit(gate.user, "bounty_create", `Created bounty event #${eventId} for battle ${battleId}`, {
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
