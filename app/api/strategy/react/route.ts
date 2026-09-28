import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;
import { getAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { withDeadline } from "@/lib/deadline";

/*
 * Reaction toggle for approved strategy posts — same rules and reasoning as
 * the announcements one (capped emoji set, one per member per post, re-tap
 * removes, different emoji swaps, PK makes double-taps uncountable). The only
 * difference: reactions are gated to APPROVED posts — a pending tactic has no
 * audience to signal to yet. Reply carries fresh counts for that post.
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
    `SELECT 1 FROM mcwv_strategy_posts WHERE id = $1 AND status = 'approved' LIMIT 1`,
    [id]
  );
  if (live.rows.length === 0) {
    return NextResponse.json({ error: "Only approved tactics take reactions." }, { status: 409 });
  }

  const existing = await pool.query<{ emoji: string }>(
    `SELECT emoji FROM mcwv_strategy_reacts WHERE post_id = $1 AND user_id = $2 AND emoji = $3 LIMIT 1`,
    [id, user.id, emoji]
  );
  if (existing.rows.length > 0) {
    await pool.query(`DELETE FROM mcwv_strategy_reacts WHERE post_id = $1 AND user_id = $2 AND emoji = $3`, [id, user.id, emoji]);
  } else {
    await pool.query(`DELETE FROM mcwv_strategy_reacts WHERE post_id = $1 AND user_id = $2`, [id, user.id]);
    try {
      await pool.query(`INSERT INTO mcwv_strategy_reacts (post_id, user_id, emoji) VALUES ($1, $2, $3)`, [id, user.id, emoji]);
    } catch (err) {
      if ((err as { code?: string })?.code !== "23505") throw err;
    }
  }

  const counts = await pool.query<{ emoji: string; n: number; mine: boolean }>(
    `SELECT r.emoji, COUNT(*)::int AS n, bool_or(r.user_id = $2::bigint) AS mine
     FROM mcwv_strategy_reacts r WHERE r.post_id = $1 GROUP BY r.emoji`,
    [id, user.id]
  );
  return NextResponse.json({ ok: true, reacts: counts.rows.map((c) => ({ emoji: c.emoji, count: Number(c.n), mine: Boolean(c.mine) })) });
}
