import webpush from "web-push";
import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Web Push (VAPID) server side.
//
// Storage:   push_subscriptions (one row per device per user, upserted by
//            endpoint) + app_push_state (tiny KV used to dedupe broadcasts
//            like "war declared" per battle id).
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
  url?: string;
  tag?: string;
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
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

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

export async function sendPushToUser(userId: number, payload: PushPayload) {
  await ensurePushTables();
  const { rows } = await pool.query<SubRow>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  return deliver(rows, payload);
}

export async function sendPushToAll(payload: PushPayload) {
  await ensurePushTables();
  const { rows } = await pool.query<SubRow>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions`
  );
  return deliver(rows, payload);
}
