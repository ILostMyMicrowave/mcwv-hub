import { pool } from "@/lib/db";
import { broadcastTablesExist } from "@/lib/broadcastDb";
import {
  ensurePushTables,
  getStateText,
  sendPushToAll,
  sendPushToUser,
  setStateText,
} from "@/lib/pushServer";

// ---------------------------------------------------------------------------
// Push fan-out jobs, all best-effort and designed to be called from the
// /api/app-status poll (installed devices already hit it every few minutes).
// Every job is deduped/cooled-down so a noisy source can never spam phones.
// ---------------------------------------------------------------------------

const PRESENCE_API = "https://presence.roblox.com/v1/presence/users";
const PRESENCE_CHUNK = 50;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

const PRESENCE_OFFLINE = 0;
const PRESENCE_ONLINE = 1;
const PRESENCE_INGAME = 2;

type HubMember = { id: number; username: string; roblox_id: string };

type PresenceMap = Map<string, number>;

/**
 * War-time presence tracker: alerts subscribers when a linked member goes
 * from IN GAME → ONLINE or OFFLINE while a clan battle is live.
 *  - First time we see a member we just record their state (no alert) —
 *    cold starts can never blast a batch of fake "left the game!" pings.
 *  - 30 min per-member cooldown so reconnect-flapping can't spam.
 */
export async function sweepWarPresence(): Promise<{ alerted: number }> {
  await ensurePushTables();

  const { rows: members } = await pool.query<HubMember>(
    `SELECT id::bigint AS id, username, roblox_id::text AS roblox_id
     FROM users
     WHERE roblox_id IS NOT NULL AND roblox_id::text <> ''
     LIMIT 100`
  );
  if (members.length === 0) return { alerted: 0 };

  const presenceById: PresenceMap = new Map();
  for (let i = 0; i < members.length; i += PRESENCE_CHUNK) {
    const chunk = members.slice(i, i + PRESENCE_CHUNK);
    const userIds = chunk
      .map((m) => Number(m.roblox_id))
      .filter((n) => Number.isFinite(n));
    if (userIds.length === 0) continue;
    try {
      const res = await fetch(PRESENCE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ userIds }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        userPresences?: Array<{ userId?: number; userPresenceType?: number }>;
      };
      for (const p of data.userPresences ?? []) {
        if (p.userId === undefined || p.userPresenceType === undefined) continue;
        presenceById.set(String(p.userId), Number(p.userPresenceType));
      }
    } catch {
      // Roblox hiccup — try the next chunk; presence is best-effort.
    }
  }
  if (presenceById.size === 0) return { alerted: 0 };

  const ids = members.map((m) => m.roblox_id);
  const { rows: prevRows } = await pool.query<{
    roblox_id: string;
    presence: number;
    last_alerted_at: Date | string | null;
  }>(
    `SELECT roblox_id, presence, last_alerted_at
     FROM member_presence_state
     WHERE roblox_id = ANY($1::text[])`,
    [ids]
  );
  const prev = new Map(prevRows.map((r) => [r.roblox_id, r]));

  const now = Date.now();
  const leavers: Array<{ id: number; username: string }> = [];

  for (const member of members) {
    const current = presenceById.get(member.roblox_id);
    if (current === undefined) continue;

    const before = prev.get(member.roblox_id);
    const leftGame =
      before?.presence === PRESENCE_INGAME &&
      (current === PRESENCE_ONLINE || current === PRESENCE_OFFLINE);
    const cooldownOver =
      !before?.last_alerted_at ||
      now - new Date(before.last_alerted_at).getTime() > ALERT_COOLDOWN_MS;
    // `before` existing at all is the cold-start guard: never alert on a
    // member's first-ever recorded state.
    const shouldAlert = Boolean(before) && leftGame && cooldownOver;

    if (shouldAlert) leavers.push({ id: member.id, username: member.username });

    await pool.query(
      `INSERT INTO member_presence_state
         (roblox_id, user_id, username, presence, last_alerted_at, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (roblox_id) DO UPDATE SET
         presence = EXCLUDED.presence,
         user_id = EXCLUDED.user_id,
         username = EXCLUDED.username,
         last_alerted_at = CASE
           WHEN $5 THEN NOW()
           ELSE member_presence_state.last_alerted_at
         END,
         updated_at = NOW()`,
      [member.roblox_id, member.id, member.username, current, shouldAlert]
    );
  }

  if (leavers.length === 0) return { alerted: 0 };

  // One personal nudge per leaver — only their own devices get it.
  for (const leaver of leavers) {
    try {
      await sendPushToUser(
        leaver.id,
        {
          title: "🎮 You left the game!",
          body: "You went from in-game to online/offline mid-war — MCWV needs you back in there! ⚔️",
          url: "/leaderboard",
          tag: "presence-nudge",
        },
        { type: "presence" }
      );
    } catch {
      // One member's delivery failure must not stop the others.
    }
  }
  return { alerted: leavers.length };
}

/**
 * Broadcast → app alerts: mirrors new bot broadcast_sends rows to every
 * subscribed device. Officer-killable via 'alert_broadcasts_enabled'
 * (PushCard toggle). Cursor-based, so each send alerts exactly once; the
 * very first run just marks the cursor so history never back-floods.
 */
export async function sweepBroadcasts(): Promise<{ pushed: number }> {
  const enabled = await getStateText("alert_broadcasts_enabled");
  if (enabled === "false") return { pushed: 0 };

  const exists = await broadcastTablesExist().catch(() => false);
  if (!exists) return { pushed: 0 };

  const cursorRaw = await getStateText("broadcast_push_cursor");
  const cursor = Number(cursorRaw ?? "0");

  if (!cursorRaw || !Number.isFinite(cursor) || cursor <= 0) {
    // First run: mark where we are, push nothing.
    const { rows } = await pool.query<{ m: string }>(
      `SELECT COALESCE(MAX(id), 0)::text AS m FROM broadcast_sends`
    );
    await setStateText("broadcast_push_cursor", rows[0]?.m ?? "0");
    return { pushed: 0 };
  }

  const { rows } = await pool.query<{
    id: number;
    message: string | null;
    audience: string | null;
  }>(
    `SELECT id, message, audience
     FROM broadcast_sends
     WHERE id > $1
     ORDER BY id ASC
     LIMIT 5`,
    [cursor]
  );

  let pushed = 0;
  for (const row of rows) {
    const message = String(row.message ?? "")
      .replace(/<@[!&]?\d+>/g, "")
      .replace(/<#\d+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const body = message.length > 160 ? `${message.slice(0, 157)}…` : message;
    try {
      await sendPushToAll(
        {
          title: "📢 MCWV Broadcast",
          body: body || "New clan broadcast.",
          url: "/dashboard",
        },
        { type: "broadcast", fullBody: message || undefined }
      );
      pushed += 1;
    } catch {
      // Delivery hiccup — cursor still moves; this row is done.
    }
    await setStateText("broadcast_push_cursor", String(row.id));
  }
  return { pushed };
}
