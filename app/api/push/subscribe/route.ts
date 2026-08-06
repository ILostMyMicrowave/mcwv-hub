import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { ensurePushTables } from "@/lib/pushServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const deleteSchema = z.object({
  endpoint: z.string().url().max(2000),
});

// Is the signed-in user subscribed on at least one device?
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  await ensurePushTables();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM push_subscriptions WHERE user_id = $1`,
    [auth.user.id]
  );
  return NextResponse.json({ success: true, subscribed: Number(rows[0]?.n ?? 0) > 0 });
}

// Save (or refresh) this device's push subscription. The body is exactly
// what PushSubscription.toJSON() produces in the browser.
export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  await ensurePushTables();
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW()`,
    [auth.user.id, parsed.data.endpoint, parsed.data.keys.p256dh, parsed.data.keys.auth, userAgent]
  );
  return NextResponse.json({ success: true });
}

// Remove this device's subscription (alerts off).
export async function DELETE(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid endpoint." }, { status: 400 });
  }

  await ensurePushTables();
  await pool.query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [auth.user.id, parsed.data.endpoint]
  );
  return NextResponse.json({ success: true });
}
