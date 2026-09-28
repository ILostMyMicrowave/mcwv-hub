"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * /announcements — the Clan feed (slice B, plan v2).
 * Officers post (now or scheduled), one thing can be pinned, everyone
 * reacts with 👍🔥👀 — that's the whole product. Un-pinned posts drop into
 * "Earlier" after 7 days. Authors get 15 minutes to edit their own post;
 * after that only delete. Same resilience rules as /servers: failed loads
 * keep the last good board, nothing polls while hidden, every control has
 * an honest busy state.
 */

type Member = { username: string; robloxId: string | null };
type ReactStat = { emoji: string; count: number; mine: boolean };
export type Item = {
  id: number;
  body: string;
  pinned: boolean;
  scheduled: boolean;
  showAt: string | null;
  createdAt: string | null;
  editedAt: string | null;
  author: Member;
  reacts: ReactStat[];
  canEdit: boolean;
  canDelete: boolean;
};

const INPUT =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:bg-black/50 touch-manipulation";
const EMOJIS = ["👍", "🔥", "👀"];

function normTime(iso: string | null): string {
  if (!iso) return "a while ago";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "just now";
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function inTime(iso: string | null): string {
  if (!iso) return "soon";
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(s) || s <= 0) return "now";
  if (s < 3600) return `in ${Math.ceil(s / 60)}m`;
  if (s < 86400) return `in ${(s / 3600).toFixed(1)}h`;
  return `in ${Math.round(s / 86400)}d`;
}

function Pfp({ member, size = 28 }: { member: Member; size?: number }) {
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

export default function AnnouncementsPage() {
  const [me, setMe] = useState<{ username: string; isOfficer: boolean } | null>(null);
  const [feed, setFeed] = useState<Item[]>([]);
  const [earlier, setEarlier] = useState<Item[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null); // reaction-specific feedback; survives a refresh (loadErr would be wiped by it)
  const [needLogin, setNeedLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [cBody, setCBody] = useState("");
  const [cWhen, setCWhen] = useState("");
  const [cPin, setCPin] = useState(false);
  const [cErr, setCErr] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setLoadErr(data?.error ?? "Couldn't reach the hub — try again.");
        return; // keep the last good feed on screen
      }
      setMe({ username: data.me.username, isOfficer: !!data.me.isOfficer });
      setFeed(data.feed ?? []);
      setEarlier(data.earlier ?? []);
      setLoadErr(null);
      setNeedLogin(false);
    } catch {
      setLoadErr("Couldn't reach the hub — try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
      const res = await fetch("/api/announcements", {
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

  const react = async (item: Item, emoji: string) => {
    // optimistic: bump the chip immediately, then trust the server's reply
    const hadThis = item.reacts.some((r) => r.emoji === emoji && r.mine);
    const bumped = item.reacts
      .map((r) => {
        if (r.emoji === emoji) {
          return hadThis ? { ...r, count: Math.max(0, r.count - 1), mine: false } : { ...r, count: r.count + 1, mine: true };
        }
        // switching away from a different emoji: only OUR old chip loses a count
        return r.mine && !hadThis ? { ...r, count: Math.max(0, r.count - 1), mine: false } : r;
      })
      .filter((r) => r.count > 0);
    if (!hadThis && !item.reacts.some((r) => r.emoji === emoji)) bumped.push({ emoji, count: 1, mine: true });
    const swap = (list: Item[]) => list.map((x) => (x.id === item.id ? { ...x, reacts: bumped.filter((r) => r.count > 0) } : x));
    setFeed(swap);
    setEarlier(swap);
    try {
      const res = await fetch("/api/announcements/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, emoji }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.reacts) {
        const fix = (list: Item[]) => list.map((x) => (x.id === item.id ? { ...x, reacts: data.reacts } : x));
        setFeed(fix);
        setEarlier(fix);
        setNote(null);
      } else if (!res.ok) {
        setNote(data?.error ?? "That reaction didn't land.");
        void load(); // refresh counts underneath while the note stays up
      }
    } catch {
      setNote("Couldn't reach the hub — that chip may be lying.");
      void load();
    }
  };

  const submitCompose = async () => {
    setCErr("");
    if (cBody.trim().length < 3) {
      setCErr("Write at least a few words.");
      return;
    }
    const ok = await act({ action: "create", body: cBody.trim(), showAt: cWhen || null, pin: cPin });
    if (ok) {
      setCBody("");
      setCWhen("");
      setCPin(false);
      setComposeOpen(false);
    }
  };

  const submitEdit = async (item: Item) => {
    if (editBody.trim().length < 3) return;
    const ok = await act({ action: "edit", id: item.id, body: editBody.trim() });
    if (ok) {
      setEditId(null);
      setEditBody("");
    }
  };

  const handleDelete = async (item: Item) => {
    if (confirmDelId !== item.id) {
      setConfirmDelId(item.id);
      window.setTimeout(() => setConfirmDelId((v) => (v === item.id ? null : v)), 3000);
      return;
    }
    setConfirmDelId(null);
    await act({ action: "delete", id: item.id });
  };

  const ItemCard = (props: { item: Item; faded?: boolean }) => {
    const { item, faded } = props;
    return (
      <div
        className={`st-rise rounded-3xl border p-4 sm:p-5 ${
          item.pinned && !faded
            ? "border-yellow-400/40 bg-yellow-400/[0.06]"
            : item.scheduled
              ? "border-emerald-400/30 bg-emerald-400/[0.05]"
              : "border-white/10 bg-white/[0.04]"
        } ${faded ? "opacity-70" : ""}`}
      >
        <div className="flex items-start gap-3">
          <Pfp member={item.author} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-400">
              <span className="font-bold text-zinc-200">{item.author.username}</span>
              {item.pinned && <span className="rounded-full border border-yellow-400/40 bg-yellow-400/10 px-2 py-px text-[10px] font-bold uppercase text-yellow-200">📌 pinned</span>}
              {item.scheduled && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-px text-[10px] font-bold uppercase text-emerald-200">
                  ⏳ scheduled · {inTime(item.showAt)}
                </span>
              )}
              <span>· {item.scheduled ? "will post " : ""}{normTime(item.createdAt)}</span>
              {item.editedAt && <span className="italic">· edited {normTime(item.editedAt)}</span>}
            </div>
            {editId === item.id ? (
              <div className="mt-2 space-y-2">
                <textarea className={`${INPUT} min-h-24 resize-y`} value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={2000} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void submitEdit(item)} className="min-h-11 rounded-2xl bg-emerald-500 px-5 text-sm font-bold text-black disabled:opacity-50">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditId(null)} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-zinc-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-zinc-100">{item.body}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {EMOJIS.map((e) => {
                const r = item.reacts.find((x) => x.emoji === e);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => void react(item, e)}
                    className={`min-h-9 rounded-full border px-2.5 text-[13px] transition active:scale-95 ${
                      r?.mine ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100" : "border-white/15 bg-black/25 text-zinc-300 hover:bg-white/10"
                    }`}
                    title={r?.mine ? "Take your reaction back" : "React"}
                  >
                    {e} {r?.count ? r.count : ""}
                  </button>
                );
              })}
              <span className="flex-1" />
              {!faded && item.canEdit && editId !== item.id && (
                <button
                  type="button"
                  onClick={() => { setEditId(item.id); setEditBody(item.body); }}
                  className="min-h-9 rounded-full border border-white/15 px-3 text-[12px] text-zinc-300 hover:bg-white/10"
                >
                  Edit
                </button>
              )}
              {!faded && item.canDelete && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(item)}
                  className={`min-h-9 rounded-full border px-3 text-[12px] transition ${
                    confirmDelId === item.id ? "border-red-400/50 bg-red-500/20 text-red-200" : "border-white/15 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {confirmDelId === item.id ? "Sure?" : "Delete"}
                </button>
              )}
              {!faded && me?.isOfficer && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act({ action: item.pinned ? "unpin" : "pin", id: item.id })}
                  className="min-h-9 rounded-full border border-white/15 px-3 text-[12px] text-zinc-300 hover:bg-white/10"
                  title={item.pinned ? "Unpin — the feed has no sticky until the next one" : "Pin to top of feed + home strip"}
                >
                  {item.pinned ? "Unpin" : "📌 Pin"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
      <div className="st-rise flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
        <div>
          <h1 className="text-xl font-black text-white">📣 Announcements</h1>
          <p className="text-[12.5px] text-zinc-400">Clan news. React so the officers know you saw it — 👍 takes one tap.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} className="min-h-11 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-zinc-200 transition hover:bg-white/10 disabled:opacity-40">
          {busy ? "…" : "↻"}
        </button>
      </div>

      {needLogin && (
        <div className="rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-sm text-yellow-100">
          Log in to read the clan&apos;s announcements — <a className="underline" href="/login">go to login</a>.
        </div>
      )}
      {loadErr && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2.5 text-[13px] text-yellow-200">
          {loadErr}
          {feed.length > 0 && <span className="text-yellow-200/70"> · showing the last feed I have.</span>}
        </div>
      )}
      {note && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2.5 text-[13px] text-yellow-200">
          {note}
        </div>
      )}

      {me?.isOfficer && (
        <div className="st-rise rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          {composeOpen ? (
            <div className="space-y-3">
              <textarea className={`${INPUT} min-h-28 resize-y`} placeholder="What's the word? (2000 chars max — markdown-free honesty beats formatting)" value={cBody} onChange={(e) => setCBody(e.target.value)} maxLength={2000} />
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-zinc-300">
                <label className="flex items-center gap-2">
                  Show at
                  <input type="datetime-local" className="min-h-11 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-[13px] text-white" value={cWhen} onChange={(e) => setCWhen(e.target.value)} />
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={cPin} onChange={(e) => setCPin(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                  Pin it
                </label>
                {cWhen && <span className="text-emerald-300">{inTime(new Date(cWhen).toISOString())}</span>}
              </div>
              {cErr && <p className="text-[13px] text-red-300">{cErr}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void submitCompose()} className="min-h-11 rounded-2xl bg-emerald-500 px-6 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? "Posting…" : cWhen ? "Schedule" : "Post now"}
                </button>
                <button type="button" onClick={() => { setComposeOpen(false); setCErr(""); }} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-zinc-300">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setComposeOpen(true)} className="min-h-11 w-full rounded-2xl border border-dashed border-emerald-400/40 px-4 text-sm text-emerald-300 transition hover:bg-emerald-400/10">
              + New announcement {feed.some((f) => !f.scheduled && !f.pinned) ? "" : "(the clan is quiet — good time)"}
            </button>
          )}
        </div>
      )}

      {!me && !needLogin && !loadErr && <p className="px-2 text-sm text-zinc-500">Loading the feed…</p>}
      {me && feed.length === 0 && !composeOpen && <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">Nothing posted yet. When there&apos;s news, it lands here.</div>}

      {feed.map((item) => <ItemCard key={item.id} item={item} />)}

      {earlier.length > 0 && (
        <div className="pt-2">
          <button type="button" onClick={() => setShowEarlier((v) => !v)} className="min-h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-[13px] text-zinc-400 transition hover:text-zinc-200">
            {showEarlier ? "▲ Hide earlier" : `▾ Earlier (${earlier.length}) — the last 30 days of news`}
          </button>
          {showEarlier && <div className="mt-2 space-y-3">{earlier.map((item) => <ItemCard key={item.id} item={item} faded />)}</div>}
        </div>
      )}
    </main>
  );
}
