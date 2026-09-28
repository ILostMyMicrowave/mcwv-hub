"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * /strategy — the tactics board (slice C, plan v2).
 * Members write tactics → they queue → an officer approves, or FIXES THEN
 * APPROVES (credit shown, no reject-and-repost churn) → board. Rejected is a
 * door not a verdict: reason attached, edit freely, resubmit (v2 chip).
 * War-linked posts archive themselves into Past when the war's record closes.
 * #hashtags + fixed tags drive the filter chips. 👍🔥👀 = the signal.
 * Resilience is the house style: last-good data survives failed refreshes,
 * nothing polls while hidden, every action has an honest busy state.
 */

type Member = { username: string; robloxId: string | null };
type ReactStat = { emoji: string; count: number; mine: boolean };
type Item = {
  id: number;
  title: string;
  body: string;
  tags: string[];
  status: "pending" | "approved" | "rejected";
  revision: number;
  rejectReason: string | null;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  approvedAt: string | null;
  polishedBy: string | null;
  author: Member;
  war: { id: string; name: string; closed: boolean } | null;
  reacts: ReactStat[];
  canEdit: boolean;
  canDelete: boolean;
  canQueue: boolean;
  canPin: boolean;
};
type War = { id: string; name: string; open: boolean };

const INPUT =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:bg-black/50 touch-manipulation";
const EMOJIS = ["👍", "🔥", "👀"];

function ago(iso: string | null): string {
  if (!iso) return "a while ago";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "just now";
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Pfp({ member, size = 26 }: { member: Member; size?: number }) {
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

type Editor = { mode: "propose" | "fix" | "revise"; id?: number; title: string; body: string; warId: string; tags: string[] } | null;

export default function StrategyPage() {
  const [me, setMe] = useState<{ username: string; isOfficer: boolean } | null>(null);
  const [board, setBoard] = useState<Item[]>([]);
  const [past, setPast] = useState<Item[]>([]);
  const [queue, setQueue] = useState<Item[]>([]);
  const [mine, setMine] = useState<Item[]>([]);
  const [wars, setWars] = useState<War[]>([]);
  const [tagCloud, setTagCloud] = useState<{ tag: string; n: number }[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [tab, setTab] = useState<"board" | "queue" | "mine">("board");
  const [tag, setTag] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [editorErr, setEditorErr] = useState("");
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/strategy${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setLoadErr(data?.error ?? "Couldn't reach the hub — try again.");
        return; // keep last good render
      }
      setMe({ username: data.me.username, isOfficer: !!data.me.isOfficer });
      setBoard(data.board ?? []);
      setPast(data.past ?? []);
      setQueue(data.queue ?? []);
      setMine(data.mine ?? []);
      setWars(data.wars ?? []);
      setTagCloud(data.tagCloud ?? []);
      setLoadErr(null);
      setNeedLogin(false);
    } catch {
      setLoadErr("Couldn't reach the hub — try again.");
    } finally {
      setBusy(false);
    }
  }, [tag]);

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
      const res = await fetch("/api/strategy", {
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
    const hadThis = item.reacts.some((r) => r.emoji === emoji && r.mine);
    const bumped = item.reacts
      .map((r) => {
        if (r.emoji === emoji) return hadThis ? { ...r, count: Math.max(0, r.count - 1), mine: false } : { ...r, count: r.count + 1, mine: true };
        return r.mine && !hadThis ? { ...r, count: Math.max(0, r.count - 1), mine: false } : r;
      })
      .filter((r) => r.count > 0);
    if (!hadThis && !item.reacts.some((r) => r.emoji === emoji)) bumped.push({ emoji, count: 1, mine: true });
    const swap = (list: Item[]) => list.map((x) => (x.id === item.id ? { ...x, reacts: bumped } : x));
    setBoard(swap);
    setPast(swap);
    setMine(swap);
    try {
      const res = await fetch("/api/strategy/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, emoji }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.reacts) {
        const fix = (list: Item[]) => list.map((x) => (x.id === item.id ? { ...x, reacts: data.reacts } : x));
        setBoard(fix);
        setPast(fix);
        setMine(fix);
        setNote(null);
      } else if (!res.ok) {
        setNote(data?.error ?? "That reaction didn't land.");
        void load();
      }
    } catch {
      setNote("Couldn't reach the hub — that chip may be lying.");
      void load();
    }
  };

  const detectedTags = (body: string): string[] =>
    [...new Set([...body.matchAll(/(?:^|\s)#([a-z0-9_]{2,20})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 6);

  const submitEditor = async () => {
    if (!editor) return;
    setEditorErr("");
    if (editor.title.trim().length < 4 || editor.body.trim().length < 20) {
      setEditorErr("Title 4+ chars, body 20+ — enough for someone to act on.");
      return;
    }
    const payload: Record<string, unknown> = {
      action: editor.mode === "propose" ? "create" : editor.mode === "fix" ? "approveEdit" : "revise",
      title: editor.title.trim(),
      body: editor.body.trim(),
      tags: editor.tags,
    };
    if (editor.id) payload.id = editor.id;
    if (editor.mode === "propose" && editor.warId) payload.warId = editor.warId;
    const ok = await act(payload);
    if (ok) {
      setEditor(null);
      setEditorErr("");
      if (editor.mode === "propose") setNote("Queued — officers will see it in the queue tab.");
      if (editor.mode === "revise") setNote("Back in the queue. Revision counts — the officers see you did the work.");
      window.setTimeout(() => setNote(null), 5000);
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

  const submitReject = async (item: Item) => {
    if (rejectReason.trim().length < 3) return;
    setRejectFor(null);
    const saved = rejectReason;
    setRejectReason("");
    await act({ action: "reject", id: item.id, reason: saved.trim() });
  };

  const Card = (props: { item: Item; section: "board" | "queue" | "mine" | "past" }) => {
    const { item, section } = props;
    const faded = section === "past";
    const editing = editor && editor.id === item.id;
    return (
      <div className={`rounded-3xl border p-4 sm:p-5 ${item.pinned && section === "board" ? "border-yellow-400/40 bg-yellow-400/[0.06]" : "border-white/10 bg-white/[0.04]"} ${faded ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-3">
          <Pfp member={item.author} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[16px] font-black text-white">{item.title}</h3>
              {item.pinned && section === "board" && <span className="rounded-full border border-yellow-400/40 bg-yellow-400/10 px-2 py-px text-[10px] font-bold uppercase text-yellow-200">📌 pinned</span>}
              {item.war && (
                <span className={`rounded-full border px-2 py-px text-[10px] font-bold ${item.war.closed ? "border-white/15 text-zinc-500" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`}>
                  ⚔ {item.war.name}{item.war.closed ? " · archived" : ""}
                </span>
              )}
              {item.revision > 1 && <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-px text-[10px] font-bold text-sky-200" title="Revised and resubmitted">v{item.revision}</span>}
              {section === "mine" && item.status === "pending" && <span className="rounded-full border border-white/15 px-2 py-px text-[10px] uppercase text-zinc-400">⏳ in queue</span>}
              {section === "mine" && item.status === "rejected" && <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2 py-px text-[10px] uppercase text-red-200">✋ needs changes</span>}
            </div>
            <div className="mt-0.5 text-[12px] text-zinc-500">
              {item.author.username} · {ago(section === "board" || faded ? item.approvedAt : item.updatedAt)}
              {item.polishedBy && <span className="text-sky-300/80"> · polished by {item.polishedBy}</span>}
            </div>

            {editing ? (
              <div className="mt-3 space-y-2">
                <input className={INPUT} value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} maxLength={100} placeholder="Title" />
                <textarea className={`${INPUT} min-h-32 resize-y`} value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} maxLength={4000} />
                {editorErr && <p className="text-[13px] text-red-300">{editorErr}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void submitEditor()} className="min-h-11 rounded-2xl bg-emerald-500 px-5 text-sm font-bold text-black disabled:opacity-50">
                    {editor.mode === "fix" ? "✓ Save & approve" : editor.mode === "revise" ? "↻ Resubmit" : "Save"}
                  </button>
                  <button type="button" onClick={() => { setEditor(null); setEditorErr(""); }} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-zinc-300">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-100">{item.body}</p>
                {item.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((t) => (
                      <button key={t} type="button" onClick={() => { setTag(t); setTab("board"); }} className="rounded-full border border-white/10 bg-black/30 px-2 py-px text-[11px] text-zinc-400 hover:text-emerald-300">
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
                {item.status === "rejected" && item.rejectReason && section === "mine" && (
                  <div className="mt-2 rounded-2xl border border-red-400/25 bg-red-400/[0.06] px-3 py-2 text-[13px] text-red-200">
                    <b>Officer note:</b> {item.rejectReason}
                  </div>
                )}
              </>
            )}

            {!editing && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(section === "board" || section === "past") &&
                  EMOJIS.map((e) => {
                    const r = item.reacts.find((x) => x.emoji === e);
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => void react(item, e)}
                        className={`min-h-9 rounded-full border px-2.5 text-[13px] transition active:scale-95 ${r?.mine ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100" : "border-white/15 bg-black/25 text-zinc-300 hover:bg-white/10"}`}
                        title={r?.mine ? "Take it back" : "React"}
                      >
                        {e} {r?.count ? r.count : ""}
                      </button>
                    );
                  })}
                <span className="flex-1" />
                {section === "queue" && (
                  <>
                    <button type="button" disabled={busy} onClick={() => void act({ action: "approve", id: item.id })} className="min-h-9 rounded-full bg-emerald-500 px-4 text-[12.5px] font-bold text-black disabled:opacity-50">
                      ✓ Approve
                    </button>
                    <button type="button" onClick={() => setEditor({ mode: "fix", id: item.id, title: item.title, body: item.body, warId: "", tags: item.tags })} className="min-h-9 rounded-full border border-white/15 px-3 text-[12px] text-zinc-200 hover:bg-white/10">
                      ✎ Fix &amp; approve
                    </button>
                    {rejectFor === item.id ? (
                      <span className="flex items-center gap-1.5">
                        <input className="min-h-9 w-40 rounded-full border border-white/15 bg-black/40 px-3 text-[12.5px] text-white outline-none" placeholder="What to fix (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} />
                        <button type="button" onClick={() => void submitReject(item)} className="min-h-9 rounded-full border border-red-400/50 bg-red-500/20 px-3 text-[12px] text-red-200">Send</button>
                        <button type="button" onClick={() => { setRejectFor(null); setRejectReason(""); }} className="min-h-9 rounded-full px-2 text-[12px] text-zinc-400">✕</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => { setRejectFor(item.id); setRejectReason(""); }} className="min-h-9 rounded-full border border-white/15 px-3 text-[12px] text-zinc-300 hover:bg-white/10">
                        Reject
                      </button>
                    )}
                  </>
                )}
                {item.canEdit && section !== "queue" && (
                  <button type="button" onClick={() => setEditor({ mode: "revise", id: item.id, title: item.title, body: item.body, warId: "", tags: item.tags })} className="min-h-9 rounded-full border border-white/15 px-3 text-[12px] text-zinc-300 hover:bg-white/10">
                    {item.status === "rejected" ? "Revise & resubmit" : "Edit"}
                  </button>
                )}
                {item.canPin && (
                  <button type="button" disabled={busy} onClick={() => void act({ action: item.pinned ? "unpin" : "pin", id: item.id })} className="min-h-9 rounded-full border border-white/15 px-3 text-[12px] text-zinc-300 hover:bg-white/10">
                    {item.pinned ? "Unpin" : "📌 Pin"}
                  </button>
                )}
                {item.canDelete && (
                  <button type="button" disabled={busy} onClick={() => void handleDelete(item)} className={`min-h-9 rounded-full border px-3 text-[12px] transition ${confirmDelId === item.id ? "border-red-400/50 bg-red-500/20 text-red-200" : "border-white/15 text-zinc-400 hover:bg-white/10"}`}>
                    {confirmDelId === item.id ? "Sure?" : "Delete"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const openWar = wars.find((w) => w.open);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
      <div className="st-rise rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">🧠 Strategy Board</h1>
            <p className="text-[12.5px] text-zinc-400">Tactics go through the queue so what&apos;s on the board is trustworthy. Rejected means &quot;fix and resubmit&quot;, never &quot;no&quot;.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy} className="min-h-11 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-40">
            {busy ? "…" : "↻"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTab("board")} className={`min-h-10 rounded-full px-4 text-[13px] font-bold ${tab === "board" ? "bg-emerald-500 text-black" : "border border-white/15 text-zinc-300"}`}>Board</button>
          {me?.isOfficer && (
            <button type="button" onClick={() => setTab("queue")} className={`min-h-10 rounded-full px-4 text-[13px] font-bold ${tab === "queue" ? "bg-emerald-500 text-black" : "border border-white/15 text-zinc-300"}`}>
              Queue{queue.length > 0 ? ` (${queue.length})` : ""}
            </button>
          )}
          <button type="button" onClick={() => setTab("mine")} className={`min-h-10 rounded-full px-4 text-[13px] font-bold ${tab === "mine" ? "bg-emerald-500 text-black" : "border border-white/15 text-zinc-300"}`}>My posts{mine.length > 0 ? ` (${mine.length})` : ""}</button>
        </div>
      </div>

      {needLogin && (
        <div className="rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-sm text-yellow-100">
          Log in to read and propose tactics — <a className="underline" href="/login">go to login</a>.
        </div>
      )}
      {loadErr && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2.5 text-[13px] text-yellow-200">
          {loadErr}
          {board.length > 0 && <span className="text-yellow-200/70"> · showing the last board I have.</span>}
        </div>
      )}
      {note && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[13px] text-emerald-100">{note}</div>}

      {tab === "board" && (
        <>
          {tagCloud.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setTag("")} className={`min-h-9 rounded-full px-3 text-[12px] ${tag === "" ? "bg-emerald-500 font-bold text-black" : "border border-white/15 text-zinc-300"}`}>All</button>
              {tagCloud.map((t) => (
                <button key={t.tag} type="button" onClick={() => setTag(tag === t.tag ? "" : t.tag)} className={`min-h-9 rounded-full px-3 text-[12px] ${tag === t.tag ? "bg-emerald-500 font-bold text-black" : "border border-white/15 text-zinc-300 hover:bg-white/10"}`}>
                  #{t.tag} {t.n}
                </button>
              ))}
            </div>
          )}

          <button type="button" onClick={() => setEditor({ mode: "propose", title: "", body: "", warId: "", tags: [] })} className="min-h-11 w-full rounded-2xl border border-dashed border-emerald-400/40 px-4 text-sm text-emerald-300 transition hover:bg-emerald-400/10">
            + Propose a tactic {tag ? <span className="text-emerald-200/70">(it&apos;ll carry #{tag})</span> : ""}
          </button>

          {editor?.mode === "propose" && (
            <div className="st-rise space-y-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <input className={INPUT} placeholder="Title — say the what (e.g. Defense swap on 3rd wave)" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} maxLength={100} />
              <textarea className={`${INPUT} min-h-32 resize-y`} placeholder="Body — the how. Plain words. #hashtags anywhere in here become tags." value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} maxLength={4000} />
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-300">
                <label className="flex items-center gap-1.5">Attach to war:
                  <select className="min-h-10 rounded-xl border border-white/10 bg-black/40 px-2 text-[13px] text-white" value={editor.warId} onChange={(e) => setEditor({ ...editor, warId: e.target.value })}>
                    <option value="">— none —</option>
                    {wars.filter((w) => w.open || w.id === editor.warId).map((w) => (
                      <option key={w.id} value={w.id}>{w.name}{w.open ? "" : " (closed)"}</option>
                    ))}
                  </select>
                </label>
                {!openWar && <span className="text-zinc-500">no open war — attach later?</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                {["farming", "defense", "gems", "rules"].map((t) => {
                  const active = editor.tags.includes(t) || detectedTags(editor.body).includes(t);
                  return (
                    <button key={t} type="button" onClick={() => setEditor({ ...editor, tags: active ? editor.tags.filter((x) => x !== t) : [...editor.tags, t] })} className={`min-h-8 rounded-full border px-2.5 ${active ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100" : "border-white/15 text-zinc-400"}`}>
                      #{t}
                    </button>
                  );
                })}
                {detectedTags(editor.body).filter((t) => !["farming", "defense", "gems", "rules"].includes(t)).map((t) => (
                  <span key={t} className="min-h-8 rounded-full border border-white/10 bg-black/30 px-2.5 leading-8 text-zinc-400">#{t} from your text</span>
                ))}
              </div>
              {editorErr && <p className="text-[13px] text-red-300">{editorErr}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void submitEditor()} className="min-h-11 rounded-2xl bg-emerald-500 px-6 text-sm font-bold text-black disabled:opacity-50">{busy ? "Sending…" : "Submit for review"}</button>
                <button type="button" onClick={() => setEditor(null)} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-zinc-300">Cancel</button>
              </div>
            </div>
          )}

          {board.length === 0 && !editor && <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">{tag ? `Nothing tagged #${tag} on the board yet.` : "The board is empty. First tactic that survives the queue owns it."}</div>}
          {board.map((item) => <Card key={item.id} item={item} section="board" />)}

          {past.length > 0 && (
            <div className="pt-1">
              <button type="button" onClick={() => setShowPast((v) => !v)} className="min-h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-[13px] text-zinc-400 hover:text-zinc-200">
                {showPast ? "▲ Hide past" : `▾ Past (${past.length}) — old wars & older tactics, still searchable by the chips above`}
              </button>
              {showPast && <div className="mt-2 space-y-2">{past.map((item) => <Card key={item.id} item={item} section="past" />)}</div>}
            </div>
          )}
        </>
      )}

      {tab === "queue" && me?.isOfficer && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">Queue clear. Remember: fixing a good post beats rejecting a sloppy one.</div>
          ) : (
            queue.map((item) => <Card key={item.id} item={item} section="queue" />)
          )}
        </div>
      )}

      {tab === "mine" && (
        <div className="space-y-2">
          {mine.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">You haven&apos;t proposed anything yet. The board started with one brave post.</div>
          ) : (
            mine.map((item) => <Card key={item.id} item={item} section="mine" />)
          )}
        </div>
      )}
    </main>
  );
}
