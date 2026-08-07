"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STYLE_META,
  compressLoadout,
  styleOfLoadout,
  type EnchantRow,
  type ScoutRow,
  type ScoutSummary,
} from "@/lib/scoutAnalysis";

// Client-mirrored state shape (the full server type lives server-only).
type ScoutBattle = { id: string; state: string; startTime: number | null; finishTime: number | null; participants: number | null };
type ScoutState = {
  phase: string;
  battle: ScoutBattle | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  progress: Record<string, number>;
  rows: ScoutRow[];
  matches: string[];
  enchantRows: EnchantRow[];
  summary: ScoutSummary | null;
};

type Me = { role?: string | null } | null;

const PHASES: Array<{ key: string; label: string }> = [
  { key: "standings", label: "📡 War standings" },
  { key: "usernames", label: "🏷 Resolve usernames" },
  { key: "directory", label: "🗂 Public directory" },
  { key: "inventory", label: "📖 Enchant scans" },
  { key: "summary", label: "✨ Crunch meta" },
];

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const fmt = (n: number) => n.toLocaleString("en-GB");

function LoadoutChips({ names }: { names: string[] }) {
  const chips = compressLoadout(names);
  if (!chips.length) return <span className="text-zinc-600">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.name}
          className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200"
        >
          {c.name}{c.count > 1 ? ` ×${c.count}` : ""}
        </span>
      ))}
    </span>
  );
}

export default function ScoutPage() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [state, setState] = useState<ScoutState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ phase: string; progress: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"intel" | "roster">("intel");
  const [query, setQuery] = useState("");
  const [clanFilter, setClanFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [shown, setShown] = useState(150);
  const pollRef = useRef(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scout", { cache: "no-store" });
      if (res.status === 403) return;
      const data = await res.json();
      if (data?.success) setState(data.state ?? null);
    } catch {
      setError("Could not load intel — check your connection");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (me && me.role === "owner") void load();
  }, [me, load]);

  const resync = useCallback(async () => {
    if (pollRef.current) return;
    pollRef.current = true;
    setSyncing(true);
    setError(null);
    try {
      let restart = true;
      for (let guard = 0; guard < 40; guard += 1) {
        const res = await fetch("/api/scout/resync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restart }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setError(data?.error ?? "Sync failed — tap resync to retry");
          return;
        }
        setSyncProgress({ phase: data.phase, progress: data.progress ?? {} });
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.done) break;
        restart = false;
        await new Promise((r) => setTimeout(r, 2200));
      }
      await load();
    } finally {
      pollRef.current = false;
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [load]);

  const summary = state?.summary ?? null;
  const clans = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of state?.rows ?? []) if (!set.has(r.clan)) set.set(r.clan, r.clanRank);
    return Array.from(set.entries()).sort((a, b) => a[1] - b[1]).map(([name]) => name);
  }, [state]);

  const intelRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (state?.enchantRows ?? [])
      .filter((r) => clanFilter === "all" || r.clan === clanFilter)
      .filter((r) => !q || (r.username ?? r.userId).toLowerCase().includes(q) || r.enchantNames.join(" ").toLowerCase().includes(q))
      .slice()
      .sort((a, b) => b.warPoints - a.warPoints);
  }, [state, query, clanFilter]);

  const rosterRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (state?.rows ?? [])
      .filter((r) => clanFilter === "all" || r.clan === clanFilter)
      .filter((r) => roleFilter === "all" || r.role === roleFilter)
      .filter((r) => !q || (r.username ?? r.userId).toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.clanRank - b.clanRank || b.warPoints - a.warPoints);
  }, [state, query, clanFilter, roleFilter]);

  useEffect(() => {
    setShown(150);
  }, [tab, query, clanFilter, roleFilter]);

  // --- Gates ----------------------------------------------------------------
  if (me === undefined || (me && me.role === "owner" && !loaded)) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center text-zinc-400">
        <div className="text-4xl">🕵️</div>
        <p className="mt-3 text-sm">Loading enemy intel…</p>
      </main>
    );
  }
  if (!me || me.role !== "owner") {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="mt-4 text-xl font-black text-white">Owner only</h1>
        <p className="mt-2 text-sm text-zinc-500">This intel room is locked to the clan owner. Nothing to see here, move along 😄</p>
      </main>
    );
  }

  const hasData = Boolean(state && state.phase === "done" && state.summary);
  const battle = state?.battle ?? null;
  const liveWar = battle?.state === "active";
  const activePhase = syncing ? syncProgress?.phase ?? state?.phase : null;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      {/* Header */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/[0.08] via-transparent to-rose-500/[0.06] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet-300/80">👑 Owner eyes only</p>
            <h1 className="mt-1 text-3xl font-black text-white">🕵️ Enemy Intel HQ</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Top-10 clans of {battle ? <span className="font-bold text-violet-300">{battle.id}</span> : "the latest war"}
              {battle?.participants ? <span className="text-zinc-500"> · {fmt(battle.participants)} clans fought</span> : null}
            </p>
          </div>
          <div className="text-right">
            {battle && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${liveWar ? "border-rose-400/40 bg-rose-500/15 text-rose-300" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"}`}>
                {liveWar ? "🔴 LIVE WAR — standings move when resynced" : "🏁 Final standings"}
              </span>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Last synced: <span className="font-semibold text-zinc-300">{relTime(state?.finishedAt ?? state?.updatedAt)}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => void resync()}
          disabled={syncing}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-black text-white shadow-[0_8px_30px_rgba(139,92,246,0.35)] transition hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
        >
          {syncing ? "⏳ Syncing…" : hasData ? "🔄 Resync intel" : "🚀 Run first scan"}
        </button>

        {syncing && activePhase && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="grid gap-1.5 sm:grid-cols-5">
              {PHASES.map((p) => {
                const idx = PHASES.findIndex((x) => x.key === activePhase);
                const myIdx = PHASES.indexOf(p);
                const done = PHASES.findIndex((x) => x.key === (syncProgress?.phase ?? activePhase)) > myIdx || syncProgress?.phase === "done";
                const active = idx === myIdx && syncProgress?.phase !== "done";
                return (
                  <div key={p.key} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold ${active ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40" : done ? "text-emerald-400" : "text-zinc-600"}`}>
                    <span>{done ? "✅" : active ? "⏳" : "▫️"}</span>
                    <span>{p.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-zinc-500">
              {syncProgress?.progress.members ? `${fmt(syncProgress.progress.members)} members · ` : ""}
              {syncProgress?.progress.matched ? `${fmt(syncProgress.progress.matched)} public profiles · ` : ""}
              {syncProgress?.progress.enchants != null ? `${fmt(syncProgress.progress.enchants)} enchant rows scanned` : "working…"}
            </p>
          </div>
        )}

        {(error || state?.error) && !syncing && (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            ⚠️ {error ?? state?.error} — hit Resync to continue where it left off.
          </div>
        )}
      </section>

      {!hasData && !syncing && (
        <p className="mt-8 text-center text-sm text-zinc-500">No intel yet — run your first scan to raid the top clans&apos; loadouts 🗡</p>
      )}

      {hasData && summary && (
        <>
          {/* Stat chips */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Rival members", value: summary.totalMembers, icon: "👥" },
              { label: "Scored in war", value: summary.contributors, icon: "⭐" },
              { label: "Public profiles", value: summary.publicProfiles, icon: "🔓" },
              { label: "Enchants visible", value: summary.inventories, icon: "📖" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-2xl font-black text-white">{s.icon} {fmt(s.value)}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{s.label}</p>
              </div>
            ))}
          </section>

          {/* Meta verdict */}
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">🧬 Meta verdict</h2>
              {summary.recommendedStyle && (
                <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4">
                  <p className="text-sm font-black text-amber-200">
                    👑 Recommended: {STYLE_META[summary.recommendedStyle].emoji} {STYLE_META[summary.recommendedStyle].label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-100/80">{STYLE_META[summary.recommendedStyle].tip}</p>
                </div>
              )}
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    <th className="py-2">Style</th><th className="text-right">Players</th><th className="text-right">Avg pts</th><th className="text-right">Best</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.styleStats.map((s, i) => (
                    <tr key={s.style} className="border-t border-white/5">
                      <td className="py-2 pr-2 font-semibold text-zinc-200">{i === 0 ? "🥇 " : ""}{STYLE_META[s.style].emoji} {STYLE_META[s.style].label}</td>
                      <td className="text-right text-zinc-400">{s.players}</td>
                      <td className="text-right font-bold text-white">{fmt(s.avgPoints)}</td>
                      <td className="text-right text-zinc-400">{fmt(s.maxPoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-4 text-zinc-600">
                Snapshot of currently-equipped books from {summary.inventories} public rivals — enemies may have swapped since.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">📚 Enchant leaderboard</h2>
              <div className="mt-3 grid gap-2">
                {summary.enchantCounts.slice(0, 10).map((e, i) => (
                  <div key={e.name} className="flex items-center gap-3">
                    <span className="w-5 text-right text-xs font-bold text-zinc-500">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-semibold text-zinc-100">{e.name}</span>
                        <span className="text-xs font-bold text-violet-300">×{fmt(e.count)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
                          style={{ width: `${Math.max(4, (e.count / (summary.enchantCounts[0]?.count ?? 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Top scorers */}
          <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">🏆 Highest-scoring rivals we can see</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {summary.topScorers.map((t) => (
                <div key={t.userId} className="rounded-2xl border border-white/5 bg-black/20 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-bold text-white">
                      <span className="mr-1.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-violet-300">#{t.clanRank} {t.clan}</span>
                      {t.username ?? t.userId}
                    </p>
                    <span className="shrink-0 text-sm font-black text-amber-300">{fmt(t.warPoints)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.loadout.map((c) => (
                      <span key={c.name} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                        {c.name}{c.count > 1 ? ` ×${c.count}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tables */}
          <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center gap-2">
              {(["intel", "roster"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-2 text-xs font-black transition ${tab === t ? "bg-violet-500 text-white" : "border border-white/10 text-zinc-400 hover:text-white"}`}
                >
                  {t === "intel" ? `📖 Enchant intel (${summary.publicProfiles})` : `👥 Full roster (${summary.totalMembers})`}
                </button>
              ))}
              <div className="ml-auto flex flex-wrap gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or enchant…"
                  className="w-44 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-violet-400/50 focus:outline-none"
                />
                <select value={clanFilter} onChange={(e) => setClanFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-xs text-white focus:outline-none">
                  <option value="all">All clans</option>
                  {clans.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {tab === "roster" && (
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-xs text-white focus:outline-none">
                    <option value="all">All roles</option>
                    <option value="Owner">Owner</option>
                    <option value="Officer">Officer</option>
                    <option value="Member">Member</option>
                  </select>
                )}
              </div>
            </div>

            {tab === "intel" ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      <th className="py-2 pr-3">Clan</th><th className="pr-3">Player</th><th className="pr-3 text-right">War pts</th><th>Loadout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intelRows.map((r) => (
                      <tr key={r.userId} className="border-t border-white/5 align-top">
                        <td className="py-2.5 pr-3"><span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-violet-300">#{r.clanRank} {r.clan}</span></td>
                        <td className="py-2.5 pr-3 font-semibold text-zinc-100">
                          {r.username ?? r.userId}
                          {!r.inventoryPublic && <span className="ml-1.5 text-[10px] text-zinc-500">🔒</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold text-amber-300">{fmt(r.warPoints)}</td>
                        <td className="py-2.5">{r.inventoryPublic ? <LoadoutChips names={r.enchantNames} /> : <span className="text-xs text-zinc-600">inventory private</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {intelRows.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No matches — try widening the filters 🎣</p>}
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      <th className="py-2 pr-3">Clan</th><th className="pr-3">Player</th><th className="pr-3">Role</th><th className="pr-3 text-right">War pts</th><th className="text-right">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.slice(0, shown).map((r) => (
                      <tr key={`${r.clan}-${r.userId}`} className="border-t border-white/5">
                        <td className="py-2 pr-3"><span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-violet-300">#{r.clanRank} {r.clan}</span></td>
                        <td className="py-2 pr-3 font-semibold text-zinc-100">{r.username ?? r.userId}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.role === "Owner" ? "bg-amber-400/15 text-amber-300" : r.role === "Officer" ? "bg-sky-400/15 text-sky-300" : "bg-white/5 text-zinc-400"}`}>
                            {r.role === "Owner" ? "👑" : r.role === "Officer" ? "🛡" : ""} {r.role}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-bold text-amber-300">{fmt(r.warPoints)}</td>
                        <td className="py-2 text-right text-xs text-zinc-500">{r.joinDate || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rosterRows.length > shown && (
                  <button onClick={() => setShown((s) => s + 150)} className="mt-4 w-full rounded-2xl border border-white/10 py-2.5 text-xs font-bold text-zinc-300 transition hover:bg-white/5">
                    Show more ({fmt(rosterRows.length - shown)} hidden)
                  </button>
                )}
                {rosterRows.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No matches — try widening the filters 🎣</p>}
              </div>
            )}
            <p className="mt-4 text-[11px] text-zinc-600">
              Data sources: official PS99 public API (standings, rosters, contributions) + player-published public profiles only. Style tags like {STYLE_META[styleOfLoadout(["Treasure Hunter","Treasure Hunter","Treasure Hunter","Treasure Hunter","Treasure Hunter"])].label.split(" (")[0]} come from squinting at 100+ enemy loadouts so you don&apos;t have to 😎
            </p>
          </section>
        </>
      )}
    </main>
  );
}
