import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;
import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { withDeadline } from "@/lib/deadline";

/*
 * Reaction toggle for announcements — the entire engagement surface, by
 * design (no comments → nothing to moderate). Any signed-in member, three
 * emojis, one per tap; tapping the same emoji again takes it back; tapping a
 * different one switches. The PRIMARY KEY in the migration makes a double
 * tap by two fingers on two devices impossible to miscount.
 *
 * Only PUBLISHED announcements accept reactions (a scheduled post is invisible
 * to everyone else — reacting to it would be reacting to nothing).
 *
 * The route answers with the full fresh counts for that post, so the page
 * updates its own row from the reply instead of refetching the feed.
 */

const ALLOWED = new Set(["👍", "🔥", "👀"]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; emoji?: unknown } | null;
  const id = Number(body?.id);
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!Number.isInteger(id) || id <= 0 || !ALLOWED.has(emoji)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const raced = await withDeadline(toggle(id, emoji), 4_000);
  if (!raced.ok) {
    return NextResponse.json(
      raced.timedOut
        ? { error: "The database didn't answer in time — your tap may not have landed. Try again." }
        : { error: "Couldn't record that reaction. Try again." },
      { status: raced.timedOut ? 503 : 500 }
    );
  }
  return raced.value;
}

async function toggle(id: number, emoji: string): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", login: true }, { status: 401 });

  const live = await pool.query(
    `SELECT 1 FROM mcwv_announcements WHERE id = $1 AND show_at <= now() LIMIT 1`,
    [id]
  );
  if (live.rows.length === 0) {
    return NextResponse.json({ error: "That post isn't out yet (or isn't there)." }, { status: 409 });
  }

  const existing = await pool.query<{ emoji: string }>(
    `SELECT emoji FROM mcwv_announcement_reacts WHERE ann_id = $1 AND user_id = $2 AND emoji = $3 LIMIT 1`,
    [id, user.id, emoji]
  );
  if (existing.rows.length > 0) {
    await pool.query(`DELETE FROM mcwv_announcement_reacts WHERE ann_id = $1 AND user_id = $2 AND emoji = $3`, [id, user.id, emoji]);
  } else {
    // one reaction per member per post: drop any other emoji first, then land this one
    await pool.query(`DELETE FROM mcwv_announcement_reacts WHERE ann_id = $1 AND user_id = $2`, [id, user.id]);
    try {
      await pool.query(
        `INSERT INTO mcwv_announcement_reacts (ann_id, user_id, emoji) VALUES ($1, $2, $3)`,
        [id, user.id, emoji]
      );
    } catch (err) {
      // duplicate-key just means a faster tap by the same member already landed
      if ((err as { code?: string })?.code !== "23505") throw err;
    }
  }

  const counts = await pool.query<{ emoji: string; n: number; mine: boolean }>(
    `SELECT r.emoji, COUNT(*)::int AS n, bool_or(r.user_id = $2::bigint) AS mine
     FROM mcwv_announcement_reacts r WHERE r.ann_id = $1 GROUP BY r.emoji`,
    [id, user.id]
  );
  return NextResponse.json({ ok: true, reacts: counts.rows.map((c) => ({ emoji: c.emoji, count: Number(c.n), mine: Boolean(c.mine) })) });
}
