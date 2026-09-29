import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // page-data route: rides short pooler blips like /api/auth/me
import { getAuthenticatedUser } from "@/lib/authUser";
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";
import { withDeadline, kickCapMs } from "@/lib/deadline";

/*
 * Announcements (Clan pages, slice B — plan v2, 28 Sep).
 *
 * GET  : the feed. Anyone signed in sees published posts; officers ALSO see
 *        their future/scheduled ones with a "scheduled" flag. Un-pinned posts
 *        older than 7 days drop out of the main feed into "Earlier" — that's
 *        a read-side rule, no janitor needed, nothing ever disappears for
 *        real until housekeeping says so.
 * POST : officer actions — create (optional schedule + pin), edit, delete,
 *        pin flip. The one-pin-per-site rule lives in a unique index, and
 *        pinning flips ALL pins in ONE statement, so two officers clicking
 *        at once can never produce double-pinned or pin-less states.
 *        Writes run under the v2.1 deadline discipline: fast honest 503 in
 *        a pooler storm, and re-pasting a click is always safe.
 *
 * Reactions live on ./react — separate route on purpose: it's a member
 * action with different rules, and keeping it out of the officer file keeps
 * that file auditable at a glance.
 */

const MIN_LEN = 3;
const MAX_LEN = 2000;
const EDIT_WINDOW_MS = 15 * 60_000;
const RATE_MS = 2 * 60_000; // 1 post per 2 minutes, everyone's favourite old rule

type Row = Record<string, unknown>;
type ReactRow = { ann_id: string | number; emoji: string; n: number; mine: boolean };

function isOfficerRole(user: { role?: string | null } | null): boolean {
  return user?.role === "officer" || user?.role === "owner";
}

/* maps joined rows + react agg into the feed item shape the page renders */
function shapeItems(rows: Row[], reactAgg: ReactRow[], viewerId: string, isOfficer: boolean) {
  const byAnn = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of reactAgg) {
    const k = String(r.ann_id);
    const list = byAnn.get(k) ?? [];
    list.push({ emoji: String(r.emoji), count: Number(r.n), mine: Boolean(r.mine) });
    byAnn.set(k, list);
  }
  const now = Date.now();
  return rows.map((a) => {
    const createdAt = a.created_at ? new Date(String(a.created_at)).getTime() : now;
    const showAt = a.show_at ? new Date(String(a.show_at)).getTime() : now;
    const scheduled = showAt > now;
    const mineAuthor = String(a.author_id) === String(viewerId);
    return {
      id: Number(a.id),
      body: String(a.body ?? ""),
      pinned: Boolean(a.pinned),
      scheduled,
      showAt: a.show_at,
      createdAt: a.created_at,
      editedAt: a.edited_at,
      author: {
        username: a.author ? String(a.author) : "a former officer",
        robloxId: a.author_roblox ? String(a.author_roblox) : null,
      },
      reacts: byAnn.get(String(a.id)) ?? [],
      // author edits within 15 min of posting — anytime before a scheduled
      // post actually goes out; anybody who can see a future post can kill it.
      canEdit: mineAuthor && (scheduled || now - createdAt < EDIT_WINDOW_MS),
      canDelete: mineAuthor || isOfficer,
    };
  });
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", login: true }, { status: 401 });
  }
  const isOfficer = isOfficerRole(user);
  try {
    const [current, earlier] = await Promise.all([
      pool.query<Row>(
        `SELECT a.id, a.body, a.pinned, a.show_at, a.created_at, a.edited_at, a.author_id,
                u.username AS author, u.roblox_id AS author_roblox
         FROM mcwv_announcements a
         LEFT JOIN users u ON u.id = a.author_id
         WHERE ($1::boolean OR a.show_at <= now())
           AND (a.pinned OR a.show_at > now() - interval '7 days')
         ORDER BY a.pinned DESC, a.show_at DESC
         LIMIT 25`,
        [isOfficer]
      ),
      pool.query<Row>(
        `SELECT a.id, a.body, a.pinned, a.show_at, a.created_at, a.edited_at, a.author_id,
                u.username AS author, u.roblox_id AS author_roblox
         FROM mcwv_announcements a
         LEFT JOIN users u ON u.id = a.author_id
         WHERE ($1::boolean OR a.show_at <= now())
           AND NOT a.pinned AND a.show_at <= now() - interval '7 days'
         ORDER BY a.show_at DESC
         LIMIT 30`,
        [isOfficer]
      ),
    ]);
    const ids = [...current.rows, ...earlier.rows].map((r) => Number(r.id)).filter(Number.isInteger);
    let reacts: ReactRow[] = [];
    if (ids.length > 0) {
      const rr = await pool.query<ReactRow>(
        `SELECT r.ann_id, r.emoji, COUNT(*)::int AS n, bool_or(r.user_id = $2::bigint) AS mine
         FROM mcwv_announcement_reacts r
         WHERE r.ann_id = ANY($1::bigint[])
         GROUP BY r.ann_id, r.emoji`,
        [ids, user.id]
      );
      reacts = rr.rows;
    }

    return NextResponse.json({
      ok: true,
      me: { username: user.username, isOfficer },
      feed: shapeItems(current.rows, reacts, String(user.id), isOfficer),
      earlier: shapeItems(earlier.rows, reacts, String(user.id), isOfficer),
    });
  } catch (err) {
    console.error("[announcements] feed failed:", err);
    return NextResponse.json({ error: "Couldn't load the feed — database hiccup, try again in a moment." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const raced = await withDeadline(mutate(request), kickCapMs());
  if (!raced.ok) {
    if (raced.timedOut) {
      return NextResponse.json(
        { error: "The database didn't answer in time — nothing changed yet. Try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[announcements] mutation failed:", raced.error);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
  return raced.value;
}

async function mutate(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  // edit/delete are the AUTHOR's own controls — every signed-in member may
  // use them on their own posts (SQL enforces ownership); officers clear the
  // same statements via the author-or-officer branches below.
  let actorId: number;
  let isOfficer: boolean;
  if (body.action === "edit" || body.action === "delete") {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized", login: true }, { status: 401 });
    actorId = Number(user.id);
    isOfficer = isOfficerRole(user);
  } else {
    const gate = await requireAdminUser("officer");
    if (!gate.ok) return gate.response;
    actorId = Number(gate.user.id);
    isOfficer = true;
  }

  if (body.action === "create") {
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (text.length < MIN_LEN) return NextResponse.json({ error: `Write at least ${MIN_LEN} characters.` }, { status: 400 });
    if (text.length > MAX_LEN) {
      return NextResponse.json({ error: `Too long — the limit is ${MAX_LEN} characters (this is ${text.length}).` }, { status: 400 });
    }
    let showAt: Date | null = null;
    if (typeof body.showAt === "string" && body.showAt.trim()) {
      const t = Date.parse(body.showAt.trim());
      if (!Number.isFinite(t)) return NextResponse.json({ error: "That date didn't come through — use the picker." }, { status: 400 });
      const now = Date.now();
      if (t > now + 30 * 86_400_000) return NextResponse.json({ error: "You can schedule up to 30 days ahead." }, { status: 400 });
      // a past time just means "now" — don't fail a post over a clock
      showAt = t > now ? new Date(t) : null;
    }
    // rate: 1 post / 2 min counting scheduled ones (created_at is when they were written)
    const rapid = await pool.query(
      `SELECT 1 FROM mcwv_announcements WHERE author_id = $1 AND created_at > now() - $2::interval LIMIT 1`,
      [actorId, `${Math.ceil(RATE_MS / 1000)} seconds`]
    );
    if (rapid.rows.length > 0) {
      return NextResponse.json({ error: "One announcement every 2 minutes." }, { status: 429 });
    }

    const ins = await pool.query(
      `INSERT INTO mcwv_announcements (author_id, body, show_at)
       VALUES ($1, $2, COALESCE($3::timestamptz, now()))
       RETURNING id`,
      [actorId, text, showAt]
    );
    const id = Number(ins.rows[0].id);
    if (body.pin === true) await flipPin(id);
    return NextResponse.json({ ok: true, id });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which announcement?" }, { status: 400 });

  if (body.action === "edit") {
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (text.length < MIN_LEN || text.length > MAX_LEN) {
      return NextResponse.json({ error: `Between ${MIN_LEN} and ${MAX_LEN} characters please.` }, { status: 400 });
    }
    // author-only window; scheduling gives authors more room, not less
    const r = await pool.query(
      `UPDATE mcwv_announcements
       SET body = $2, edited_at = now()
       WHERE id = $1 AND author_id = $3
         AND (show_at > now() OR now() - created_at < interval '15 minutes')
       RETURNING id`,
      [id, text, actorId]
    );
    return r.rows.length
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "The 15 minute edit window has passed — delete and repost if it needs fixing." }, { status: 409 });
  }

  if (body.action === "delete") {
    const r = await pool.query(
      `DELETE FROM mcwv_announcements
       WHERE id = $1 AND (author_id = $2 OR $3::boolean)
       RETURNING id`,
      [id, actorId, isOfficer]
    );
    if (!r.rows.length) {
      return NextResponse.json({ error: "That one's not yours to delete — and only officers can step in. Refresh?" }, { status: 403 });
    }
    await pool.query(`DELETE FROM mcwv_announcement_reacts WHERE ann_id = $1`, [id]).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "pin") {
    await flipPin(id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "unpin") {
    await flipPin(-1); // clears every pin; target id -1 matches nothing
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** The one-pin invariant as a single statement: target true, every other false. */
async function flipPin(targetId: number): Promise<void> {
  await pool.query(`UPDATE mcwv_announcements SET pinned = (id = $1::bigint) WHERE pinned = true OR id = $1::bigint`, [targetId]);
}
