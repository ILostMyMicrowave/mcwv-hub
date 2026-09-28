"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * /servers — the Clan private-server board (slice A, plan 2026-09-27).
 *
 * One place for officers to park live PS links; one big JOIN for everyone
 * else. The join tap is the tracking: who tapped, when — the last 15 minutes
 * of taps render as the "probably around" row. No Roblox APIs anywhere:
 * nothing external can make this page hang or lie.
 *
 * Resilience mirrors the rest of the hub: the board fetch never nukes good
 * data (storm → stale + chip, per the settings-page lesson), every control
 * has an honest busy/error state, and nothing polls while the tab is hidden.
 */

type Member = { username: string; robloxId: string | null };
type Server = {
  id: number;
  title: string;
  note: string | null;
  url: string;
  status: "live" | "closed";
  postedBy: { username: string; robloxId: string | null };
  postedAt: string | null;
  taps: { total: number; unique: number; last: string | null };
  inNow: Member[];
};
type Board = { me: { username: string; isOfficer: boolean }; servers: Server[] };

const INPUT =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:bg-black/50 touch-manipulation";

function timeAgo(iso: string | null): string {
  if (!iso) return "a while ago";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "just now";
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Pfp({ member, size = 26 }: { member: { username: string; robloxId: string | null }; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (member.username[0] || "?").toUpperCase();
  if (!member.robloxId || broken) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40 text-[10px] font-bold text-zinc-300"
        style={{ width: size, height: size }}
        title={member.username}
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/roblox/avatar?userId=${encodeURIComponent(member.robloxId)}`}
      alt=""
      title={member.username}
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full border border-white/15 bg-black/40 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export default function ServersPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // officer form
  const [formOpen, setFormOpen] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fNote, setFNote] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [formErr, setFormErr] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/privservers", { cache: "no-store" });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setLoadErr(data?.error ?? "Couldn't reach the hub — try again.");
        return; // keep showing the last good board
      }
      setBoard({ me: data.me, servers: data.servers });
      setLoadErr(null);
      setNeedLogin(false);
      setUpdatedAt(Date.now());
    } catch {
      setLoadErr("Couldn't reach the hub — try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // gentle freshness: only when the tab is actually open, and never
    // more than once a minute; manual refresh button covers the rest.
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/privservers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadErr(data?.error ?? "The hub didn't take that — try again.");
        return false;
      }
      setLoadErr(null);
      await load();
      return true;
    } catch {
      setLoadErr("Couldn't reach the hub — try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const join = (s: Server) => {
    // Log the tap best-effort BEFORE navigating — keepalive lets it finish
    // across the tab switch. Losing it changes nothing the member feels.
    try {
      void fetch("/api/privservers/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id }),
        keepalive: true,
      }).catch(() => null);
    } catch {
      /* ancient browser: join matters more than the stat */
    }
    const w = window.open(s.url, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = s.url; // popup blocked → same tab is fine
  };

  const copy = async (s: Server) => {
    try {
      await navigator.clipboard.writeText(s.url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = s.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiedId(s.id);
    window.setTimeout(() => setCopiedId((id) => (id === s.id ? null : id)), 2000);
  };

  const submitForm = async () => {
    setFormErr("");
    if (!fTitle.trim() || !fUrl.trim()) {
      setFormErr("Needs a name and the Roblox link.");
      return;
    }
    const ok = await act({ action: "create", title: fTitle.trim(), note: fNote.trim(), url: fUrl.trim() });
    if (ok) {
      setFTitle("");
      setFNote("");
      setFUrl("");
      setFormOpen(false);
    }
  };

  const handleToggle = async (s: Server) => {
    if (s.status !== "live") {
      await act({ action: "reopen", id: s.id }); // reopening can't break anything; no confirm
      return;
    }
    if (confirmCloseId !== s.id) {
      setConfirmCloseId(s.id);
      window.setTimeout(() => setConfirmCloseId((v) => (v === s.id ? null : v)), 3000);
      return;
    }
    setConfirmCloseId(null);
    await act({ action: "close", id: s.id });
  };

  const live = board?.servers.filter((s) => s.status === "live") ?? [];
  const closed = board?.servers.filter((s) => s.status !== "live") ?? [];
  const hero = live[0];
  const isOfficer = board?.me.isOfficer === true;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <div className="st-rise flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
        <div>
          <h1 className="text-xl font-black text-white">Private Servers</h1>
          <p className="text-[12.5px] text-zinc-400">
            Join from here and the clan sees you&apos;re around — no Roblox voodoo, just honesty.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="min-h-11 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? "…" : "↻"}
        </button>
      </div>

      {needLogin && (
        <div className="rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-sm text-yellow-100">
          Log in to see the clan&apos;s servers — <a className="underline" href="/login">go to login</a>.
        </div>
      )}

      {loadErr && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2.5 text-[13px] text-yellow-200">
          {loadErr}
          {board && <span className="text-yellow-200/70"> · showing the last board I have.</span>}
        </div>
      )}

      {!board && !needLogin && !loadErr && <p className="px-2 text-sm text-zinc-500">Loading the board…</p>}

      {board && live.length === 0 && !isOfficer && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">
          No live server right now. An officer will post one before the next event — it lands here.
        </div>
      )}

      {hero && (
        <div className="st-rise rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.07] p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-emerald-300/80">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2.5 py-0.5 font-bold text-emerald-200">
              Live
            </span>
            <span>
              posted by {hero.postedBy.username} · {timeAgo(hero.postedAt)}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">{hero.title}</h2>
          {hero.note && <p className="mt-1 text-sm text-zinc-300">{hero.note}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => join(hero)}
              className="min-h-12 flex-1 rounded-2xl bg-emerald-500 px-8 text-base font-black text-black transition active:scale-[0.98] sm:flex-none"
            >
              ▶ Join server
            </button>
            <button
              type="button"
              onClick={() => void copy(hero)}
              className="min-h-12 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-zinc-200 transition hover:bg-white/10"
            >
              {copiedId === hero.id ? "Copied ✓" : "Copy link"}
            </button>
            {isOfficer && (
              <button
                type="button"
                onClick={() => void handleToggle(hero)}
                className={`min-h-12 rounded-2xl border px-4 text-sm transition ${
                  confirmCloseId === hero.id
                    ? "border-red-400/50 bg-red-500/20 text-red-200"
                    : "border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {confirmCloseId === hero.id ? "Tap again to close" : "Close"}
              </button>
            )}
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Around (tapped in ≤15m)
            </div>
            {hero.inNow.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                {hero.inNow.map((m) => (
                  <span key={m.username} className="flex items-center gap-1.5 text-[13px] text-zinc-200">
                    <Pfp member={m} />
                    {m.username}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[13px] text-zinc-500">Nobody tapped in recently — be the first.</p>
            )}
            <div className="mt-2 text-[11.5px] text-zinc-500">
              {hero.taps.total} taps · {hero.taps.unique} members · last {timeAgo(hero.taps.last)}
            </div>
          </div>
        </div>
      )}

      {isOfficer && (
        <div className="st-rise rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          {formOpen ? (
            <div className="space-y-3">
              <div className="text-sm font-bold text-white">New server link</div>
              <input className={INPUT} placeholder="Name (e.g. Gem Farm 2× — Sat war)" value={fTitle} onChange={(e) => setFTitle(e.target.value)} maxLength={80} />
              <input className={INPUT} placeholder="Note (optional — shows under the title)" value={fNote} onChange={(e) => setFNote(e.target.value)} maxLength={140} />
              <input className={INPUT} placeholder="https://www.roblox.com/games/…?privateServerLinkCode=…" value={fUrl} onChange={(e) => setFUrl(e.target.value)} inputMode="url" />
              {formErr && <p className="text-[13px] text-red-300">{formErr}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitForm()}
                  className="min-h-11 rounded-2xl bg-emerald-500 px-6 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Posting…" : "Post link"}
                </button>
                <button type="button" onClick={() => { setFormOpen(false); setFormErr(""); }} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-zinc-300">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="min-h-11 w-full rounded-2xl border border-dashed border-emerald-400/40 px-4 text-sm text-emerald-300 transition hover:bg-emerald-400/10"
            >
              + Post a private-server link {live.length > 0 && "(posting the same server just refreshes it)"}
            </button>
          )}
        </div>
      )}

      {live.length > 1 && (
        <div className="space-y-2">
          {live.slice(1).map((s) => (
            <ServerRow key={s.id} s={s} join={join} copy={copy} copied={copiedId === s.id} isOfficer={isOfficer} onToggle={handleToggle} confirm={confirmCloseId === s.id} busy={busy} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="px-1 text-[11px] uppercase tracking-wide text-zinc-500">Recent (last 14 days)</div>
          {closed.map((s) => (
            <ServerRow key={s.id} s={s} join={join} copy={copy} copied={copiedId === s.id} isOfficer={isOfficer} onToggle={handleToggle} confirm={confirmCloseId === s.id} busy={busy} />
          ))}
        </div>
      )}

      {updatedAt && (
        <p className="text-center text-[11.5px] text-zinc-600">updated {timeAgo(new Date(updatedAt).toISOString())}</p>
      )}
    </main>
  );
}

function ServerRow(props: {
  s: Server;
  join: (s: Server) => void;
  copy: (s: Server) => void | Promise<void>;
  copied: boolean;
  isOfficer: boolean;
  onToggle: (s: Server) => void | Promise<void>;
  confirm: boolean;
  busy: boolean;
}) {
  const { s, join, copy, copied, isOfficer, onToggle, confirm, busy } = props;
  const closedCard = s.status !== "live";
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${closedCard ? "border-white/5 bg-white/[0.02] opacity-70" : "border-white/10 bg-black/25"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-px text-[10px] font-bold uppercase ${closedCard ? "border-white/10 text-zinc-500" : "border-emerald-400/30 bg-emerald-400/15 text-emerald-200"}`}>
            {closedCard ? "closed" : "live"}
          </span>
          <span className="truncate text-[15px] font-bold text-white">{s.title}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-zinc-500">
          {s.postedBy.username} · {timeAgo(s.postedAt)} · {s.taps.total} taps
          {!closedCard && s.inNow.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle">
              {s.inNow.slice(0, 5).map((m) => (
                <Pfp key={m.username} member={m} size={20} />
              ))}
              <span className="text-emerald-300">{s.inNow.length} around</span>
            </span>
          )}
        </div>
        {s.note && <p className="mt-1 line-clamp-2 text-[12.5px] text-zinc-400">{s.note}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {!closedCard && (
          <>
            <button type="button" onClick={() => join(s)} className="min-h-11 flex-1 rounded-2xl bg-emerald-500/90 px-5 text-sm font-bold text-black active:scale-[0.98] sm:flex-none">
              ▶ Join
            </button>
            <button type="button" onClick={() => void copy(s)} className="min-h-11 rounded-2xl border border-white/15 px-3 text-sm text-zinc-300">
              {copied ? "✓" : "Copy"}
            </button>
          </>
        )}
        {isOfficer && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onToggle(s)}
            className={`min-h-11 rounded-2xl border px-3 text-sm transition ${
              closedCard
                ? "border-white/15 text-zinc-300 hover:bg-white/10"
                : confirm
                  ? "border-red-400/50 bg-red-500/20 text-red-200"
                  : "border-white/15 text-zinc-400 hover:bg-white/10"
            }`}
            title={closedCard ? "Bring this server back to the top as live" : "Close this card"}
          >
            {closedCard ? "Reopen" : confirm ? "Sure?" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}
