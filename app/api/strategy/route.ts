import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // page-data route: rides short pooler blips like /api/auth/me
import { getAuthenticatedUser } from "@/lib/authUser";
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";
import { withDeadline, kickCapMs } from "@/lib/deadline";

/*
 * Strategy board (Clan pages, slice C — plan v2, 28 Sep).
 *
 * GET  : everything in one payload — the approved board (pinned first; war
 *        posts auto-archived once that battle's end_time passes), the
 *        officer queue (pending, oldest first), the viewer's own posts in any
 *        status (so rejection reasons and resubmits are visible without any
 *        push/DM), the war picker list, and the tag cloud for filter chips.
 *        Optional ?tag=<slug> filters board + past.
 * POST : member actions (create, revise, delete-own) work for any signed-in
 *        member; queue actions (approve, reject, approveEdit = fix-then-
 *        approve in ONE statement so there's no half-edited state to win a
 *        prize for) and pin need officer. Officer writes ride the v2.1
 *        deadline; re-clicking a timed-out action is always safe because
 *        every statement is status-guarded.
 */

const TITLE_MIN = 4, TITLE_MAX = 100;
const BODY_MIN = 20, BODY_MAX = 4000;
const RATE_MS = 2 * 60_000;
const FIXED_TAGS = new Set(["farming", "defense", "gems", "rules"]);

function parseTags(body: string, picked: unknown): string[] {
  const found = [...body.matchAll(/(?:^|\s)#([a-z0-9_]{2,20})/gi)].map((m) => m[1].toLowerCase());
  const extra = Array.isArray(picked) ? picked.filter((t): t is string => typeof t === "string" && FIXED_TAGS.has(t.toLowerCase())) : [];
  return [...new Set([...found, ...extra])].slice(0, 6);
}

type Row = Record<string, unknown>;
type ReactRow = { post_id: string | number; emoji: string; n: number; mine: boolean };

const COLS = `s.id, s.title, s.body, s.tags, s.war_id, s.status, s.revision, s.reject_reason,
       s.pinned, s.created_at, s.updated_at, s.approved_at,
       a.username AS author, a.roblox_id AS author_roblox,
       p.username AS polished_by,
       b.battle_name AS war_name,
       (b.end_time IS NOT NULL AND b.end_time < now()) AS war_closed`;
const JOINS = `FROM mcwv_strategy_posts s
       LEFT JOIN users a ON a.id = s.author_id
       LEFT JOIN users p ON p.id = s.polished_by
       LEFT JOIN battles b ON b.battle_id = s.war_id`;
const PAST = `(b.end_time IS NOT NULL AND b.end_time < now())
         OR COALESCE(s.approved_at, s.created_at) < now() - interval '60 days'`;

function shape(rows: Row[], reactAgg: ReactRow[], viewerId: number, isOfficer: boolean) {
  const byPost = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of reactAgg) {
    const k = String(r.post_id);
    const list = byPost.get(k) ?? [];
    list.push({ emoji: String(r.emoji), count: Number(r.n), mine: Boolean(r.mine) });
    byPost.set(k, list);
  }
  return rows.map((s) => {
    const status = String(s.status ?? "pending");
    const mineAuthor = String(s.author_id) === String(viewerId);
    return {
      id: Number(s.id),
      title: String(s.title ?? ""),
      body: String(s.body ?? ""),
      tags: Array.isArray(s.tags) ? (s.tags as unknown[]).map(String) : [],
      status,
      revision: Number(s.revision ?? 1),
      rejectReason: s.reject_reason ? String(s.reject_reason) : null,
      pinned: Boolean(s.pinned),
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      approvedAt: s.approved_at,
      polishedBy: s.polished_by ? String(s.polished_by) : null,
      author: {
        username: s.author ? String(s.author) : "a former member",
        robloxId: s.author_roblox ? String(s.author_roblox) : null,
      },
      war: s.war_id
        ? { id: String(s.war_id), name: String(s.war_name ?? "a war"), closed: Boolean(s.war_closed) }
        : null,
      reacts: byPost.get(String(s.id)) ?? [],
      canEdit: mineAuthor && status !== "approved",
      canDelete: status !== "approved" ? mineAuthor || isOfficer : isOfficer,
      canQueue: isOfficer && status === "pending",
      canPin: isOfficer && status === "approved" && !Boolean(s.war_closed),
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tag = url.searchParams.get("tag")?.toLowerCase().trim() ?? "";
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", login: true }, { status: 401 });
  }
  const isOfficer = user.role === "officer" || user.role === "owner";

  try {
    const [board, past, queue, mine, wars, tagcloud] = await Promise.all([
      pool.query<Row>(
        `SELECT ${COLS} ${JOINS}
         WHERE s.status = 'approved' AND ($1 = '' OR $1 = ANY(s.tags)) AND NOT ${PAST}
         ORDER BY s.pinned DESC, s.approved_at DESC
         LIMIT 30`,
        [tag]
      ),
      pool.query<Row>(
        `SELECT ${COLS} ${JOINS}
         WHERE s.status = 'approved' AND ($1 = '' OR $1 = ANY(s.tags)) AND ${PAST}
         ORDER BY COALESCE(s.approved_at, s.created_at) DESC
         LIMIT 40`,
        [tag]
      ),
      isOfficer
        ? pool.query<Row>(
            `SELECT ${COLS} ${JOINS} WHERE s.status = 'pending' ORDER BY s.updated_at ASC LIMIT 40`
          )
        : Promise.resolve({ rows: [] as Row[] }),
      pool.query<Row>(
        `SELECT ${COLS} ${JOINS} WHERE s.author_id = $1 ORDER BY s.updated_at DESC LIMIT 15`,
        [user.id]
      ),
      pool.query<{ battle_id: string; battle_name: string | null; open: boolean }>(
        `SELECT battle_id, battle_name, (end_time IS NULL OR end_time > now()) AS open
         FROM battles
         ORDER BY COALESCE(end_time, start_time, created_at, NOW()) DESC
         LIMIT 8`
      ),
      pool.query<{ tag: string; n: number }>(
        `SELECT t.tag, COUNT(*)::int AS n
         FROM (SELECT unnest(tags) AS tag FROM mcwv_strategy_posts WHERE status = 'approved') t
         GROUP BY t.tag ORDER BY n DESC, t.tag LIMIT 12`
      ),
    ]);

    const ids = [...new Set([...board.rows, ...past.rows, ...queue.rows, ...mine.rows].map((r) => Number(r.id)))].filter(Number.isInteger);
    let reacts: ReactRow[] = [];
    if (ids.length > 0) {
      const rr = await pool.query<ReactRow>(
        `SELECT r.post_id, r.emoji, COUNT(*)::int AS n, bool_or(r.user_id = $2::bigint) AS mine
         FROM mcwv_strategy_reacts r
         WHERE r.post_id = ANY($1::bigint[])
         GROUP BY r.post_id, r.emoji`,
        [ids, user.id]
      );
      reacts = rr.rows;
    }

    return NextResponse.json({
      ok: true,
      me: { username: user.username, isOfficer },
      tagFilter: tag,
      fixedTags: [...FIXED_TAGS],
      board: shape(board.rows, reacts, Number(user.id), isOfficer),
      past: shape(past.rows, reacts, Number(user.id), isOfficer),
      queue: shape(queue.rows, reacts, Number(user.id), isOfficer),
      mine: shape(mine.rows, reacts, Number(user.id), isOfficer),
      wars: wars.rows.map((w) => ({ id: String(w.battle_id), name: String(w.battle_name ?? w.battle_id), open: Boolean(w.open) })),
      tagCloud: tagcloud.rows.map((t) => ({ tag: t.tag, n: Number(t.n) })),
    });
  } catch (err) {
    console.error("[strategy] board failed:", err);
    return NextResponse.json({ error: "Couldn't load strategy — the hub's database is having a moment." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const raced = await withDeadline(mutate(request), kickCapMs());
  if (!raced.ok) {
    if (raced.timedOut) {
      return NextResponse.json(
        { error: "The hub's database didn't answer in time — nothing changed yet. Try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[strategy] mutation failed:", raced.error);
    return NextResponse.json({ error: "Couldn't update strategy. Try again." }, { status: 500 });
  }
  return raced.value;
}

const MEMBER_ACTIONS = new Set(["create", "revise", "delete"]);

async function mutate(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  let actorId: number;
  let isOfficer: boolean;
  if (MEMBER_ACTIONS.has(body.action)) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized", login: true }, { status: 401 });
    actorId = Number(user.id);
    isOfficer = user.role === "officer" || user.role === "owner";
  } else {
    const gate = await requireAdminUser("officer");
    if (!gate.ok) return gate.response;
    actorId = Number(gate.user.id);
    isOfficer = true;
  }

  if (body.action === "create") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
    const text = typeof body.body === "string" ? body.body.trim().slice(0, BODY_MAX) : "";
    if (title.length < TITLE_MIN) return NextResponse.json({ error: `Give it a clear title (${TITLE_MIN}+ characters).` }, { status: 400 });
    if (text.length < BODY_MIN) {
      return NextResponse.json({ error: `A tactic worth pinning deserves ${BODY_MIN}+ characters — say what to do and when.` }, { status: 400 });
    }
    let warId: string | null = null;
    if (typeof body.warId === "string" && body.warId.trim()) {
      warId = body.warId.trim().slice(0, 64);
      const exists = await pool.query(`SELECT 1 FROM battles WHERE battle_id = $1 LIMIT 1`, [warId]);
      if (exists.rows.length === 0) return NextResponse.json({ error: "That war isn't in the records — pick one from the list." }, { status: 400 });
    }
    const rapid = await pool.query(
      `SELECT 1 FROM mcwv_strategy_posts WHERE author_id = $1 AND created_at > now() - $2::interval LIMIT 1`,
      [actorId, `${Math.ceil(RATE_MS / 1000)} seconds`]
    );
    if (rapid.rows.length > 0) {
      return NextResponse.json({ error: "One new tactic every 2 minutes — quality over volume." }, { status: 429 });
    }
    const tags = parseTags(text, body.tags);
    const ins = await pool.query(
      `INSERT INTO mcwv_strategy_posts (author_id, title, body, tags, war_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [actorId, title, text, tags, warId]
    );
    return NextResponse.json({ ok: true, id: Number(ins.rows[0].id), status: "pending" });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which post?" }, { status: 400 });

  if (body.action === "revise") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
    const text = typeof body.body === "string" ? body.body.trim().slice(0, BODY_MAX) : "";
    if (title.length < TITLE_MIN || text.length < BODY_MIN) {
      return NextResponse.json({ error: `Title ${TITLE_MIN}+ and body ${BODY_MIN}+ characters.` }, { status: 400 });
    }
    const r = await pool.query(
      `UPDATE mcwv_strategy_posts
       SET title = $2, body = $3, tags = $4, status = 'pending', revision = revision + 1,
           reject_reason = NULL, updated_at = now()
       WHERE id = $1 AND author_id = $5 AND status IN ('pending','rejected')
       RETURNING revision`,
      [id, title, text, parseTags(text, body.tags), actorId]
    );
    return r.rows.length
      ? NextResponse.json({ ok: true, revision: Number(r.rows[0].revision) })
      : NextResponse.json({ error: "Can't revise that one — it's either approved, gone, or not yours." }, { status: 409 });
  }

  if (body.action === "delete") {
    const r = await pool.query(
      `DELETE FROM mcwv_strategy_posts
       WHERE id = $1 AND ($2::boolean OR (author_id = $3 AND status <> 'approved'))
       RETURNING id, pinned`,
      [id, isOfficer, actorId]
    );
    if (!r.rows.length) {
      return NextResponse.json({ error: "Only the writer can pull a post before approval — officers can step in. Refresh?" }, { status: 403 });
    }
    await pool.query(`DELETE FROM mcwv_strategy_reacts WHERE post_id = $1`, [id]).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve") {
    const r = await pool.query(
      `UPDATE mcwv_strategy_posts
       SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now(), reject_reason = NULL
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id, actorId]
    );
    return r.rows.length
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Someone already handled that one — refresh the queue." }, { status: 409 });
  }

  if (body.action === "reject") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (reason.length < 3) {
      return NextResponse.json({ error: "Rejections need a reason — that's how posts come back better." }, { status: 400 });
    }
    const r = await pool.query(
      `UPDATE mcwv_strategy_posts
       SET status = 'rejected', reject_reason = $2, updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id, reason]
    );
    return r.rows.length
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "That one isn't waiting in the queue anymore — refresh." }, { status: 409 });
  }

  if (body.action === "approveEdit") {
    // fix-then-approve as ONE statement: either the polished post goes live
    // with the credit, or nothing moves — no half-edged state between officers
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
    const text = typeof body.body === "string" ? body.body.trim().slice(0, BODY_MAX) : "";
    if (title.length < TITLE_MIN || text.length < BODY_MIN) {
      return NextResponse.json({ error: `Title ${TITLE_MIN}+ and body ${BODY_MIN}+ characters.` }, { status: 400 });
    }
    const r = await pool.query(
      `UPDATE mcwv_strategy_posts
       SET title = $2, body = $3, tags = $4, status = 'approved', approved_by = $5, approved_at = now(),
           polished_by = CASE WHEN title <> $2 OR body <> $3 THEN $5 ELSE polished_by END,
           reject_reason = NULL, updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, (title <> $2 OR body <> $3) AS was_polished`,
      [id, title, text, parseTags(text, body.tags), actorId]
    );
    return r.rows.length
      ? NextResponse.json({ ok: true, polished: Boolean(r.rows[0].was_polished) })
      : NextResponse.json({ error: "Someone already handled that one — refresh the queue." }, { status: 409 });
  }

  if (body.action === "pin") {
    const eligible = await pool.query(
      `SELECT 1 FROM mcwv_strategy_posts s
       LEFT JOIN battles b ON b.battle_id = s.war_id
       WHERE s.id = $1 AND s.status = 'approved'
         AND NOT ((b.end_time IS NOT NULL AND b.end_time < now())
                  OR COALESCE(s.approved_at, s.created_at) < now() - interval '60 days')
       LIMIT 1`,
      [id]
    );
    if (eligible.rows.length === 0) {
      return NextResponse.json(
        { error: "Can't pin that — only current approved posts take the pin (finished-war and 60-day-old ones live in Past)." },
        { status: 409 }
      );
    }
    await pool.query(`UPDATE mcwv_strategy_posts SET pinned = (id = $1::bigint) WHERE pinned = true OR id = $1::bigint`, [id]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unpin") {
    const r = await pool.query(`UPDATE mcwv_strategy_posts SET pinned = false WHERE id = $1 AND pinned = true RETURNING id`, [id]);
    return r.rows.length
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "That one isn't pinned anymore — refresh?" }, { status: 409 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
