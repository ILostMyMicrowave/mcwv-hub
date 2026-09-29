import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // live board; never build-time rendered
export const maxDuration = 60; // page-data route: ride short pooler blips like /api/auth/me
import { getAuthenticatedUser } from "@/lib/authUser";
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";
import { getInGameCheck } from "@/lib/presence";
import { withDeadline, kickCapMs } from "@/lib/deadline";

/*
 * Private-server board (Clan pages, slice A — plan 2026-09-27).
 *
 * GET  : the whole board for any signed-in member: live servers (newest
 *        first) + the last 14 days of closed ones, tap stats, and the
 *        "around right now" rows (members who tapped join within 15 min).
 *        The list IS the check-in: no separate button, no Roblox API.
 * POST : officer-only mutations — create (same live link code MERGES, so a
 *        rotated link never splits the board), close, reopen.
 *        Every write runs under the same wall-clock deadline the kick
 *        routes learned (v2.1): honest 503 under a pooler storm, never a
 *        90s ride, and a late landing can't double-apply (all statements
 *        are idempotent).
 */

/**
 * Any Roblox http(s) link pointing at a game or the share handler counts —
 * people paste from the website (roblox.com/games/...) and from the mobile
 * app's share sheet (roblox.com/share?...linkCode=...), in either protocol,
 * with or without www. What matters is the HOST is genuinely roblox.com
 * (subdomains allowed; "roblox.com.evil.tld" is not) and the path is one of
 * those two. The server's identity is privateServerLinkCode / linkCode when
 * present, else the normalized URL itself.
 */
const LINK_HINT = "Paste the link from the server's Copy Link button — it starts with roblox.com/games or roblox.com/share.";

function parseRobloxLink(raw: string): { url: string; code: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (host !== "roblox.com" && !host.endsWith(".roblox.com")) return null;
  if (!/^\/(games|share)(\/|$)/i.test(u.pathname)) return null;
  const code =
    u.searchParams.get("privateServerLinkCode") || u.searchParams.get("linkCode") || "";
  const clean = code.trim() || "u:" + raw.replace(/\/+$/, "").slice(0, 180);
  return { url: raw, code: clean.slice(0, 200) };
}

type ServerRow = Record<string, unknown>;
type TapRow = { server_id: string | number; username: string | null; roblox_id: string | null 
  last_tap?: string | Date | null;};

function placeIdOf(url: string): number | null {
  const m = /\/games\/(\d+)/.exec(url) || /[?&]placeId=(\d+)/.exec(url);
  return m ? Number(m[1]) : null;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    // links are clan-internal; a logged-out visitor gets a clean 401 the
    // page renders as "log in to see this" — not an empty board.
    return NextResponse.json({ error: "Unauthorized", login: true }, { status: 401 });
  }

  // Lazy janitor: a "live" server nobody tapped for 24h closes itself.
  // Fire-and-forget on purpose — the board read below never waits for it,
  // and if the isolate freezes first the next reader does the sweep.
  void pool
    .query(
      `UPDATE mcwv_privservers s
       SET status = 'closed', closed_at = now()
       WHERE s.status = 'live'
         AND COALESCE(
               (SELECT MAX(tapped_at) FROM mcwv_privserver_taps t WHERE t.server_id = s.id),
               s.created_at
             ) < now() - interval '24 hours'`
    )
    .catch(() => null);
  // Rolling window on the tap log itself: stats live in months, not years —
  // rows older than 180 days are dead weight. Same fire-and-forget deal.
  void pool
    .query(`DELETE FROM mcwv_privserver_taps WHERE tapped_at < now() - interval '180 days'`)
    .catch(() => null);

  try {
    const [board, around] = await Promise.all([
      pool.query<ServerRow>(
        `SELECT s.id, s.title, s.note, s.url, s.status,
                s.created_at,
                u.username AS posted_by, u.roblox_id AS posted_roblox,
                COALESCE(t.total, 0)::int AS taps_total,
                COALESCE(t.uniq,   0)::int AS taps_unique,
                t.last AS taps_last
         FROM mcwv_privservers s
         LEFT JOIN users u ON u.id = s.created_by
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total,
                  COUNT(DISTINCT x.user_id) AS uniq,
                  MAX(x.tapped_at) AS last
           FROM mcwv_privserver_taps x
           WHERE x.server_id = s.id
         ) t ON TRUE
         WHERE s.status = 'live' OR s.created_at > now() - interval '14 days'
         ORDER BY (s.status = 'live') DESC, s.created_at DESC
         LIMIT 25`
      ),
      pool.query<TapRow>(
        `SELECT DISTINCT ON (x.server_id, x.user_id)
                x.server_id, u.username, u.roblox_id, x.tapped_at AS last_tap
         FROM mcwv_privserver_taps x
         JOIN users u ON u.id = x.user_id
         WHERE x.tapped_at > now() - interval '90 minutes'
           AND x.server_id IN (SELECT id FROM mcwv_privservers WHERE status = 'live')
         ORDER BY x.server_id, x.user_id, x.tapped_at DESC`
      ),
    ]);

    type Around = { key: string; username: string; robloxId: string | null; ageMin: number };
    const aroundRows: Around[] = around.rows.map((row) => {
      const tapMs = row.last_tap ? new Date(row.last_tap).getTime() : 0;
      return {
        key: String(row.server_id),
        username: String(row.username ?? "?"),
        robloxId: row.roblox_id ? String(row.roblox_id) : null,
        ageMin: Number.isFinite(tapMs) && tapMs > 0 ? (Date.now() - tapMs) / 60000 : 0,
      };
    });
    // Presence tier: a tap older than 15 min keeps its slot only while Roblox
    // says the member is still in this game; long sessions stay on the board.
    // If the check fails (any reason), behavior degrades to the old tap-only
    // 15-minute rule — never a blank board, never a fake "around".
    const staleIds = aroundRows.filter((m) => m.ageMin > 15 && m.robloxId).map((m) => m.robloxId as string);
    let presence: Map<string, boolean> | null = null;
    if (staleIds.length > 0) {
      const places = new Set(
        board.rows
          .filter((srow) => String(srow.status ?? "live") === "live")
          .map((srow) => placeIdOf(String(srow.url ?? "")))
          .filter((n): n is number => n !== null),
      );
      presence = await getInGameCheck(staleIds, places.size === 1 ? [...places][0] : null).catch(() => null);
    }
    const inNow = new Map<string, { username: string; robloxId: string | null; verified: boolean }[]>();
    for (const m of aroundRows) {
      const inGame = m.robloxId !== null && presence !== null && presence.get(m.robloxId) === true;
      if (m.ageMin > 15 && !inGame) continue;
      const list = inNow.get(m.key) ?? [];
      list.push({ username: m.username, robloxId: m.robloxId, verified: inGame });
      inNow.set(m.key, list);
    }

    return NextResponse.json({
      ok: true,
      me: { id: user.id, username: user.username, isOfficer: user.role === "officer" || user.role === "owner" },
      servers: board.rows.map((s) => ({
        id: Number(s.id),
        title: String(s.title ?? ""),
        note: s.note === null || s.note === undefined ? null : String(s.note),
        url: String(s.url ?? ""),
        status: String(s.status ?? "live"),
        postedBy: {
          username: s.posted_by ? String(s.posted_by) : "former member",
          robloxId: s.posted_roblox ? String(s.posted_roblox) : null,
        },
        postedAt: s.created_at,
        taps: {
          total: Number(s.taps_total ?? 0),
          unique: Number(s.taps_unique ?? 0),
          last: s.taps_last ?? null,
        },
        inNow: inNow.get(String(s.id)) ?? [],
      })),
    });
  } catch (err) {
    console.error("[privservers] board failed:", err);
    return NextResponse.json({ error: "Couldn't load the board — database hiccup, try again in a moment." }, { status: 500 });
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
    console.error("[privservers] mutation failed:", raced.error);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
  return raced.value;
}

async function mutate(request: Request): Promise<Response> {
  const gate = await requireAdminUser("officer");
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  if (body.action === "create") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 140) : "";
    let url = typeof body.url === "string" ? body.url.trim() : "";
    if (!title) return NextResponse.json({ error: "Give it a name so people know what it is for." }, { status: 400 });
    const parsed = parseRobloxLink(url);
    if (!parsed) {
      return NextResponse.json({ error: LINK_HINT }, { status: 400 });
    }
    const code = parsed.code;
    url = parsed.url;

    // Rotation merge: same LIVE server → refresh its row (stats/history stay).
    const merged = await pool.query(
      `UPDATE mcwv_privservers
       SET title = $1, note = NULLIF($2, ''), url = $3, created_at = now()
       WHERE link_code = $4 AND status = 'live'
       RETURNING id`,
      [title, note, url, code]
    );
    if (merged.rows.length > 0) {
      return NextResponse.json({ ok: true, id: Number(merged.rows[0].id), merged: true });
    }
    try {
      const ins = await pool.query(
        `INSERT INTO mcwv_privservers (title, note, url, link_code, created_by)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5)
         RETURNING id`,
        [title, note, url, code, gate.user.id]
      );
      return NextResponse.json({ ok: true, id: Number(ins.rows[0].id), merged: false });
    } catch (err) {
      // raced another officer posting the same live server → merge instead
      if ((err as { code?: string })?.code === "23505") {
        const again = await pool.query(
          `UPDATE mcwv_privservers SET title=$1, note=NULLIF($2,''), url=$3, created_at=now()
           WHERE link_code=$4 AND status='live' RETURNING id`,
          [title, note, url, code]
        );
        if (again.rows.length > 0) {
          return NextResponse.json({ ok: true, id: Number(again.rows[0].id), merged: true });
        }
      }
      throw err;
    }
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Which server?" }, { status: 400 });
  }

  if (body.action === "close") {
    const r = await pool.query(
      `UPDATE mcwv_privservers SET status='closed', closed_at=now() WHERE id=$1 AND status='live' RETURNING id`,
      [id]
    );
    return r.rows.length
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "That one isn't live anymore." }, { status: 409 });
  }

  if (body.action === "reopen") {
    try {
      const r = await pool.query(
        `UPDATE mcwv_privservers SET status='live', closed_at=NULL, created_at=now() WHERE id=$1 AND status='closed' RETURNING id`,
        [id]
      );
      return r.rows.length
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "Nothing to reopen there." }, { status: 409 });
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        return NextResponse.json(
          { error: "That link is already posted live — close that one first if you meant to reopen this." },
          { status: 409 }
        );
      }
      throw err;
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
