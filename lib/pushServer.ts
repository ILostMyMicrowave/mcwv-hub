import webpush from "web-push";
import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Web Push (VAPID) server side.
//
// Storage:   push_subscriptions (one row per device per user, upserted by
//            endpoint), app_push_state (tiny KV: dedupe marks, cursors,
//            feature toggles), notifications (every typed push is logged so
//            tapping it can open the in-app alert popup via #n=<id>),
//            member_presence_state (Roblox presence tracker mid-war).
// Delivery:  web-push against each stored endpoint; dead endpoints
//            (404/410) are pruned automatically.
// Config:    WEB_PUSH_VAPID_PUBLIC_KEY + WEB_PUSH_VAPID_PRIVATE_KEY on the
//            server, NEXT_PUBLIC_VAPID_PUBLIC_KEY for the client, optional
//            VAPID_SUBJECT (mailto: contact).
//
// The companion service worker (public/push-sw.js) is push-only with NO
// fetch handler, so this feature never caches a page — the deliberately
// cache-free PWA stance from app/manifest.ts stays intact.
// ---------------------------------------------------------------------------

export type PushPayload = {
  title: string;
  body?: string;
  /** REAL destination page, shown as "Open page →" in the inbox. */
  url?: string;
  tag?: string;
  /** Optional big image — Android shows it big-picture style, inbox as banner. */
  image?: string;
  /** Inbox row id — set server-side so taps deep-link /notifications?n=<id>. */
  notifId?: number | null;
};

// Alert categories — each typed send is logged to `notifications` and the
// device URL becomes /notifications?n=<id> so a tap opens the inbox with
// THAT alert highlighted.
export type PushType = "test" | "war" | "presence" | "broadcast";

export type SendOptions = {
  type?: PushType;
  /** 'clan' (default) = visible in every member's inbox; 'user' = only userId's. */
  audience?: "clan" | "user";
  /** Required when audience is 'user'. */
  userId?: number;
  /** Long-form body stored in `notifications` when the push body is truncated. */
  fullBody?: string;
};

type SubRow = { endpoint: string; p256dh: string; auth: string };

let tablesReady: Promise<void> | null = null;

export function ensurePushTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id BIGINT`);
      await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT`);
      await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS p256dh TEXT`);
      await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS auth TEXT`);
      await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT`);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON push_subscriptions (endpoint)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)`
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_push_state (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id BIGSERIAL PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'info',
          title TEXT NOT NULL,
          body TEXT,
          url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT`);
      await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS url TEXT`);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (id DESC)`
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS member_presence_state (
          roblox_id TEXT PRIMARY KEY,
          user_id BIGINT,
          username TEXT,
          presence SMALLINT NOT NULL DEFAULT -1,
          last_alerted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE member_presence_state ADD COLUMN IF NOT EXISTS user_id BIGINT`);
      await pool.query(`ALTER TABLE member_presence_state ADD COLUMN IF NOT EXISTS username TEXT`);
      await pool.query(`ALTER TABLE member_presence_state ADD COLUMN IF NOT EXISTS last_alerted_at TIMESTAMPTZ`);
      await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'clan'`);
      await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id BIGINT`);
      // ⚠️ THE missing line that caused "push arrived but inbox is empty":
      // logNotification INSERTs image_url and the inbox SELECTs it, so when
      // this column was absent every log failed silently and the inbox
      // query 500'd into a fake-empty state. Never remove.
      await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS image_url TEXT`);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id)`
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_read_marker (
          user_id BIGINT PRIMARY KEY,
          last_read_notif_id BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE alert_read_marker ADD COLUMN IF NOT EXISTS last_read_notif_id BIGINT NOT NULL DEFAULT 0`);
      // If this was ever created as TEXT, GREATEST() is lexicographic:
      // GREATEST('9','12') stays '9', so Mark all never advances. Force bigint.
      // Only rewrite when the type is actually wrong — ALTER TYPE always
      // rewrites the table even bigint→bigint.
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'alert_read_marker'
              AND column_name = 'last_read_notif_id'
              AND data_type <> 'bigint'
          ) THEN
            ALTER TABLE alert_read_marker
              ALTER COLUMN last_read_notif_id TYPE BIGINT
              USING (
                CASE
                  WHEN TRIM(last_read_notif_id::text) ~ '^[0-9]+$'
                    THEN TRIM(last_read_notif_id::text)::bigint
                  ELSE 0
                END
              );
          END IF;
        END $$;
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

// ---------------------------------------------------------- app state KV ---
// Values are stored as JSON strings (to_jsonb($2::text)) → pg hands them
// back as plain strings. Keys in use: 'war-push:<battleId>' (dedupe row),
// 'alert_broadcasts_enabled' ('true'/'false', default on),
// 'broadcast_push_cursor' (last broadcast_send id we alerted for).

export async function getStateText(key: string): Promise<string | null> {
  await ensurePushTables();
  const { rows } = await pool.query<{ value: unknown }>(
    `SELECT value FROM app_push_state WHERE key = $1`,
    [key]
  );
  const value = rows[0]?.value;
  return typeof value === "string" ? value : null;
}

export async function setStateText(key: string, value: string): Promise<void> {
  await ensurePushTables();
  await pool.query(
    `INSERT INTO app_push_state (key, value)
     VALUES ($1, to_jsonb($2::text))
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = NOW()`,
    [key, value]
  );
}

// ------------------------------------------------------------- vapid/core ---

export function pushConfigured(): boolean {
  return Boolean(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
}

let vapidDetailsSet = false;

function getWebpush() {
  if (!pushConfigured()) return null;
  if (!vapidDetailsSet) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@mcwv-hub.vercel.app",
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY as string,
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY as string
    );
    vapidDetailsSet = true;
  }
  return webpush;
}

const DEAD_ENDPOINT_CODES = new Set([404, 410]);

async function deliver(rows: SubRow[], payload: PushPayload) {
  const wp = getWebpush();
  if (!wp) {
    return { sent: 0, failed: rows.length, reason: "not-configured" as const };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await wp.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          { TTL: 3600 }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const status = (err as { statusCode?: number } | null)?.statusCode;
        if (status && DEAD_ENDPOINT_CODES.has(status)) {
          // Subscription is gone (browser-level unsubscribe) — forget it.
          await pool
            .query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [row.endpoint])
            .catch(() => null);
        }
      }
    })
  );

  return { sent, failed };
}

// ------------------------------------------------------- typed send helpers ---

async function logNotification(
  type: PushType,
  payload: PushPayload,
  opts: SendOptions
): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO notifications (type, title, body, url, audience, user_id, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id::text AS id`,
      [
        type,
        payload.title.slice(0, 200),
        (opts.fullBody ?? payload.body ?? "").slice(0, 2000),
        payload.url ?? null,
        opts.audience ?? "clan",
        opts.audience === "user" ? (opts.userId ?? null) : null,
        payload.image ?? null,
      ]
    );
    return rows[0] ? Number(rows[0].id) : null;
  } catch (err) {
    // Logging must never block an actual push — but it MUST be loud:
    // a silent failure here is exactly how "push arrived, inbox empty"
    // bugs hide. Watch for this line in Vercel logs.
    console.error("[push] inbox log failed:", err);
    return null;
  }
}

// Taps land on the inbox, deep-linked to the alert. The REAL destination
// page stays on the notification row for the inbox's "Open page →" link.
function buildTapUrl(id: number | null): string {
  return id ? `/notifications?n=${id}` : "/notifications";
}

// Returns the inbox id alongside the payload so callers can surface whether
// the alert actually landed in the inbox (diagnosing "push but empty inbox").
async function prepare(
  payload: PushPayload,
  opts: SendOptions = {}
): Promise<{ payload: PushPayload; notifId: number | null }> {
  if (!opts.type) return { payload, notifId: null };
  const id = await logNotification(opts.type, payload, opts);
  return { payload: { ...payload, url: buildTapUrl(id), notifId: id }, notifId: id };
}

export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
  opts: SendOptions = {}
) {
  await ensurePushTables();
  if (opts.type === "war") {
    const { rows } = await pool.query<{ enabled: boolean }>(`SELECT enabled FROM user_notif_prefs WHERE user_id = $1 AND type = 'war' LIMIT 1`, [userId]);
    if (rows[0]?.enabled !== true) return { sent: 0, failed: 0, payload, notifId: null };
  }
  const { payload: finalPayload, notifId } = await prepare(payload, opts);
  const { rows } = await pool.query<SubRow>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  const result = await deliver(rows, finalPayload);
  return { ...result, notifId };
}

export async function sendPushToAll(payload: PushPayload, opts: SendOptions = {}) {
  await ensurePushTables();
  const { payload: finalPayload, notifId } = await prepare(payload, opts);
  const { rows } = await pool.query<SubRow>(
    opts.type === "war"
      ? `SELECT s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN user_notif_prefs p ON s.user_id = p.user_id AND p.type = 'war' WHERE p.enabled = true`
      : `SELECT endpoint, p256dh, auth FROM push_subscriptions`,
  );
  const result = await deliver(rows, finalPayload);
  return { ...result, notifId };
}
