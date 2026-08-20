"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MemberProfile, WarTimelinePoint } from "@/lib/profiles";

type Tab = "roster" | "gems" | "detail" | "gamepass" | "improved" | "timeline";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "roster", label: "Roster", icon: "👥" },
  { id: "gems", label: "Gem Leaderboard", icon: "💎" },
  { id: "detail", label: "Member Detail", icon: "🔍" },
  { id: "gamepass", label: "Gamepass", icon: "🎟" },
  { id: "improved", label: "Most Improved", icon: "🚀" },
  { id: "timeline", label: "War Timeline", icon: "📈" },
];

const GEM_PRESETS = [
  { label: "< 5B", value: 5_000_000_000 },
  { label: "< 1B", value: 1_000_000_000 },
  { label: "< 100M", value: 100_000_000 },
  { label: "< 10M", value: 10_000_000 },
];

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function Rank({ value }: { value: number | null }) {
  const medals = ["🥇", "🥈", "🥉"];
  if (value === null || value === undefined) return <span className="text-zinc-500">—</span>;
  if (value <= 3) return <span>{medals[value - 1]} #{value}</span>;
  return <span className="text-zinc-300">#{value}</span>;
}

export default function WarProfilesPage() {
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [warTimeline, setWarTimeline] = useState<WarTimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("roster");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [conn, setConn] = useState("all");
  const [gemFilter, setGemFilter] = useState<number | null>(null);
  const [gemCustom, setGemCustom] = useState("");
  const [masteryFilter, setMasteryFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/war/profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((d) => {
        setMembers(d.members || []);
        setWarTimeline(d.warTimeline || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Failed to load");
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let list = members;
    if (role !== "all") list = list.filter((m) => m.role === role);
    if (conn === "connected") list = list.filter((m) => m.connected);
    if (conn === "not") list = list.filter((m) => !m.connected);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.username.toLowerCase().includes(q) || m.robloxId.includes(q));
    }
    const gemThreshold = gemFilter ?? (gemCustom ? parseFloat(gemCustom) * 1_000_000_000 : null);
    if (gemThreshold !== null && gemThreshold > 0) {
      list = list.filter((m) => m.connected && m.gems !== null && m.gems < gemThreshold);
    }
    if (masteryFilter !== null && masteryFilter > 0) {
      list = list.filter((m) => m.connected && m.masteryAverage !== null && m.masteryAverage < masteryFilter);
    }
    return list;
  }, [members, role, conn, search, gemFilter, gemCustom, masteryFilter]);

  const connected = members.filter((m) => m.connected);
  const avgGems = avg(connected.map((m) => m.gems));
  const avgMastery = avg(connected.map((m) => m.masteryAverage));
  const avgRank = avg(connected.map((m) => m.rank));
  const avgRobux = avg(connected.map((m) => m.robuxSpent));

  const gemBoard = useMemo(
    () => members.filter((m) => m.connected && m.gems !== null).sort((a, b) => (b.gems ?? 0) - (a.gems ?? 0)),
    [members]
  );

  const improved = useMemo(
    () => members.filter((m) => m.connected && m.gemDelta !== null).sort((a, b) => (b.gemDelta ?? 0) - (a.gemDelta ?? 0)),
    [members]
  );

  const gamepassStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of connected) for (const g of m.gamepasses) counts.set(g, (counts.get(g) || 0) + 1);
    const total = Math.max(connected.length, 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({
      name, count: n, pct: Math.round((n / total) * 100),
    }));
  }, [connected]);

  const selectedMember = selected ? members.find((m) => m.robloxId === selected) ?? null : null;

  if (loading)
    return (
      <main className="min-h-screen bg-[#070b1a] p-4 text-zinc-200">
        <div className="mx-auto max-w-6xl">
          <div className="skeleton-shimmer h-8 w-56 rounded bg-zinc-800/50" />
          <div className="skeleton-shimmer mt-6 h-40 rounded-2xl bg-zinc-800/40" />
          <div className="skeleton-shimmer mt-4 h-64 rounded-2xl bg-zinc-800/40" />
        </div>
      </main>
    );

  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b1a] p-4 text-zinc-300">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <div className="text-3xl">⚠️</div>
          <p className="mt-2">Couldn&apos;t load profiles: {error}</p>
          <p className="mt-1 text-sm text-zinc-400">You must be an officer/admin to view this.</p>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#070b1a] px-3 py-5 text-zinc-200 sm:px-5">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">MCWV · Staff</div>
            <h1 className="text-2xl font-black text-white sm:text-3xl">Profiles</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {members.length} members · {connected.length} connected · all PS99 data in one place
            </p>
          </div>
        </header>

        {/* Averages */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card label="Avg Gems" value={avgGems === null ? "—" : fmt(avgGems)} />
          <Card label="Avg Mastery" value={avgMastery === null ? "—" : fmt(avgMastery)} />
          <Card label="Avg Rank" value={avgRank === null ? "—" : String(avgRank)} />
          <Card label="Avg Robux Spent" value={avgRobux === null ? "—" : fmt(avgRobux)} />
          <Card label="Below 5B Gems" value={String(members.filter((m) => m.connected && m.gems !== null && m.gems < 5_000_000_000).length)} />
        </div>

        {/* Charts row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniHist label="Gems" values={connected.map((m) => m.gems)} color="bg-violet-500" />
          <MiniHist label="Mastery" values={connected.map((m) => m.masteryAverage)} color="bg-sky-500" />
          <MiniHist label="Rank" values={connected.map((m) => m.rank)} color="bg-emerald-500" />
          <MiniHist label="Robux Spent" values={connected.map((m) => m.robuxSpent)} color="bg-amber-500" />
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
                tab === t.id ? "bg-violet-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "roster" && (
          <RosterTab
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            role={role}
            setRole={setRole}
            conn={conn}
            setConn={setConn}
            gemFilter={gemFilter}
            setGemFilter={setGemFilter}
            gemCustom={gemCustom}
            setGemCustom={setGemCustom}
            masteryFilter={masteryFilter}
            setMasteryFilter={setMasteryFilter}
            avgGems={avgGems}
            avgMastery={avgMastery}
            onSelect={setSelected}
            onOpenDetail={() => setTab("detail")}
          />
        )}

        {tab === "gems" && <GemTab members={gemBoard} onSelect={(id) => { setSelected(id); setTab("detail"); }} />}

        {tab === "detail" && <MemberDetail members={connected} selected={selectedMember} onSelect={setSelected} />}

        {tab === "gamepass" && <GamepassTab stats={gamepassStats} members={connected} />}

        {tab === "improved" && <ImprovedTab members={improved} />}

        {tab === "timeline" && <TimelineTab points={warTimeline} />}
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}

// Tiny bar distribution chart (top 8 buckets).
function MiniHist({ label, values, color }: { label: string; values: (number | null)[]; color: string }) {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (!nums.length)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
        <div className="mt-2 text-sm text-zinc-600">No data</div>
      </div>
    );
  const buckets = Array(8).fill(0);
  const max = Math.max(...nums, 1);
  for (const n of nums) {
    const idx = Math.min(7, Math.floor((n / max) * 8));
    buckets[idx] += 1;
  }
  const maxBucket = Math.max(...buckets, 1);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-2 flex h-12 items-end gap-1">
        {buckets.map((b, i) => (
          <div key={i} className={`flex-1 rounded-t ${color}`} style={{ height: `${Math.max((b / maxBucket) * 100, 6)}%` }} />
        ))}
      </div>
    </div>
  );
}

function RosterTab(props: {
  filtered: MemberProfile[];
  search: string;
  setSearch: (s: string) => void;
  role: string;
  setRole: (r: string) => void;
  conn: string;
  setConn: (c: string) => void;
  gemFilter: number | null;
  setGemFilter: (n: number | null) => void;
  gemCustom: string;
  setGemCustom: (s: string) => void;
  masteryFilter: number | null;
  setMasteryFilter: (n: number | null) => void;
  avgGems: number | null;
  avgMastery: number | null;
  onSelect: (id: string) => void;
  onOpenDetail: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input
          value={props.search}
          onChange={(e) => props.setSearch(e.target.value)}
          placeholder="Search name…"
          className="col-span-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-violet-500 sm:col-span-1"
        />
        <Select value={props.role} onChange={props.setRole} options={[["all", "All roles"], ["member", "Member"], ["officer", "Officer"], ["owner", "Owner"]]} />
        <Select value={props.conn} onChange={props.setConn} options={[["all", "All"], ["connected", "Connected"], ["not", "Not connected"]]} />
        <Select
          value={props.gemFilter === null ? "none" : String(props.gemFilter)}
          onChange={(v) => props.setGemFilter(v === "none" ? null : Number(v))}
          options={[["none", "Gems"], ...GEM_PRESETS.map((p) => [String(p.value), p.label] as [string, string])]}
        />
        <input
          value={props.gemCustom}
          onChange={(e) => props.setGemCustom(e.target.value)}
          placeholder="Custom < X B"
          inputMode="decimal"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-violet-500"
        />
        <Select
          value={props.masteryFilter === null ? "none" : String(props.masteryFilter)}
          onChange={(v) => props.setMasteryFilter(v === "none" ? null : Number(v))}
          options={[["none", "Mastery"], ["20", "< 20"], ["30", "< 30"], ["40", "< 40"], ["50", "< 50"]]}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span>Showing <b className="text-zinc-200">{props.filtered.length}</b> members</span>
        <span>Avg gems <b className="text-zinc-200">{props.avgGems === null ? "—" : fmt(props.avgGems)}</b></span>
        <span>Avg mastery <b className="text-zinc-200">{props.avgMastery === null ? "—" : fmt(props.avgMastery)}</b></span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-zinc-400">
              <th className="px-3 py-2.5">Member</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5">Gems</th>
              <th className="px-3 py-2.5">Mastery</th>
              <th className="px-3 py-2.5">Rank</th>
              <th className="px-3 py-2.5">Gamepass</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {props.filtered.map((m) => (
              <tr key={m.robloxId} className="cursor-pointer border-b border-white/5 hover:bg-white/5" onClick={() => { props.onSelect(m.robloxId); props.onOpenDetail(); }}>
                <td className="px-3 py-2">
                  <span className="font-semibold text-violet-200">{m.username}</span>
                </td>
                <td className="px-3 py-2 capitalize text-zinc-300">{m.role}</td>
                <td className={`px-3 py-2 ${belowThreshold(m.gems, props.avgGems) ? "font-bold text-red-400" : "text-zinc-200"}`}>{m.connected ? fmt(m.gems) : "—"}</td>
                <td className="px-3 py-2 text-zinc-200">{m.connected ? fmt(m.masteryAverage) : "—"}</td>
                <td className="px-3 py-2 text-zinc-200">{m.connected ? (m.rank ?? "—") : "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-400">{m.connected ? (m.gamepasses.length ? m.gamepasses.slice(0, 2).join(", ") : "—") : "—"}</td>
                <td className="px-3 py-2">
                  {m.connected ? (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-300">✅</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">⚠️</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!props.filtered.length && <div className="px-4 py-10 text-center text-sm text-zinc-500">No members match these filters.</div>}
      </div>
    </div>
  );
}

function belowThreshold(gems: number | null, avgGems: number | null): boolean {
  if (gems === null || avgGems === null) return false;
  return gems < avgGems * 0.5;
}

function Select(props: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1130] px-2 py-2 text-sm text-white outline-none focus:border-violet-500">
      {props.options.map(([v, l]) => <option key={v} value={v} className="bg-[#0c1130]">{l}</option>)}
    </select>
  );
}

function GemTab({ members, onSelect }: { members: MemberProfile[]; onSelect: (id: string) => void }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {members.map((m, i) => (
        <button key={m.robloxId} onClick={() => onSelect(m.robloxId)} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left hover:bg-white/10">
          <div className="flex items-center gap-2">
            <Rank value={i + 1} />
            <span className="font-semibold text-violet-200">{m.username}</span>
          </div>
          <span className="font-bold text-white">{fmt(m.gems)}</span>
        </button>
      ))}
      {!members.length && <div className="col-span-full py-10 text-center text-sm text-zinc-500">No connected members with gem data.</div>}
    </div>
  );
}

// Full member detail — shows everything the individual profile shows.
function MemberDetail({
  members,
  selected,
  onSelect,
}: {
  members: MemberProfile[];
  selected: MemberProfile | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {members.map((m) => (
          <button key={m.robloxId} onClick={() => onSelect(m.robloxId)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm ${selected?.robloxId === m.robloxId ? "bg-violet-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
            {m.username}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.avatarUrl ?? ""} alt="" className="h-14 w-14 rounded-full" />
            <div className="min-w-0">
              <Link href={`/profile/${selected.username}`} className="text-lg font-bold text-white hover:underline">
                {selected.username}
              </Link>
              <div className="text-xs text-zinc-400">Role: {selected.role} · Gem delta: {(selected.gemDelta ?? 0) >= 0 ? "+" : ""}{fmt(selected.gemDelta)}</div>
            </div>
          </div>

          {/* Core stats */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Gems" value={fmt(selected.gems)} accent />
            <Stat label="Rank" value={selected.rank === null ? "—" : String(selected.rank)} />
            <Stat label="Rank Stars" value={selected.rankStars === null ? "—" : String(selected.rankStars)} />
            <Stat label="Mastery Avg" value={fmt(selected.masteryAverage)} />
            <Stat label="Rebirths" value={fmt(selected.rebirths)} />
            <Stat label="Eggs Hatched" value={fmt(selected.eggsHatched)} />
            <Stat label="Sessions" value={fmt(selected.totalSessions)} />
            <Stat label="Zones Unlocked" value={fmt(selected.zonesUnlocked)} />
            <Stat label="Achievements" value={fmt(selected.achievementsCount)} />
            <Stat label="Goals Completed" value={fmt(selected.goalsCompleted)} />
            <Stat label="Robux Spent" value={fmt(selected.robuxSpent)} />
            <Stat label="Booth Gems Earned" value={fmt(selected.boothDiamondsEarned)} />
          </div>

          {/* Loadout */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Ultimate" value={selected.ultimate || "—"} />
            <Stat label="Hoverboard" value={selected.hoverboard || "—"} />
            <Stat label="Booth" value={selected.booth || "—"} />
          </div>

          {/* Masteries */}
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Masteries</div>
            {selected.mastery && Object.keys(selected.mastery).length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {Object.entries(selected.mastery).map(([name, lvl]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="truncate text-zinc-300">{name}</span>
                    <span className="font-semibold text-white">{lvl}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No mastery data.</div>
            )}
          </div>

          {/* Equipped pets */}
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Equipped pets</div>
            <div className="flex flex-wrap gap-1.5">
              {selected.equippedPets.length ? selected.equippedPets.map((p, i) => (
                <span key={i} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-200">{p}</span>
              )) : (
                <span className="text-sm text-zinc-500">No equipped pet data.</span>
              )}
            </div>
          </div>

          {/* Gamepasses */}
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Gamepasses</div>
            <div className="flex flex-wrap gap-1.5">
              {selected.gamepasses.length ? selected.gamepasses.map((g, i) => (
                <span key={i} className="rounded-lg bg-violet-500/15 px-2 py-1 text-xs text-violet-200">{g}</span>
              )) : (
                <span className="text-sm text-zinc-500">No gamepass data.</span>
              )}
            </div>
          </div>

          <div className="mt-4 text-xs text-zinc-500">
            First join {fmtDate(selected.firstJoin)} · Last join {fmtDate(selected.lastJoin)}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">
          Select a connected member to see their full stats.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${accent ? "text-violet-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function GamepassTab({ stats, members }: { stats: { name: string; count: number; pct: number }[]; members: MemberProfile[] }) {
  const top = stats.slice(0, 8);
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h3 className="mb-3 text-sm font-bold text-white">Gamepass coverage</h3>
        {top.length ? top.map((g) => (
          <div key={g.name} className="mb-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">{g.name}</span>
              <span className="text-zinc-400">{g.count}/{members.length} · {g.pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded bg-white/5">
              <div className="h-2 rounded bg-violet-500" style={{ width: `${g.pct}%` }} />
            </div>
          </div>
        )) : <div className="text-sm text-zinc-500">No gamepass data yet.</div>}
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h3 className="mb-3 text-sm font-bold text-white">Members</h3>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {members.map((m) => (
            <Link key={m.robloxId} href={`/profile/${m.username}`} className="flex items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-white/5">
              <span className="text-violet-200">{m.username}</span>
              <span className="text-xs text-zinc-400">{m.gamepasses.length ? m.gamepasses.slice(0, 3).join(", ") : "—"}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImprovedTab({ members }: { members: MemberProfile[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="border-b border-white/10 px-4 py-2.5 text-xs text-zinc-400">Gem change over the last 14 days — most gained first</div>
      <div className="max-h-[60vh] divide-y divide-white/5 overflow-y-auto">
        {members.map((m, i) => (
          <div key={m.robloxId} className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <Rank value={i + 1} />
              <span className="font-semibold text-violet-200">{m.username}</span>
            </div>
            <span className={`font-bold ${(m.gemDelta ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {(m.gemDelta ?? 0) >= 0 ? "+" : ""}{fmt(m.gemDelta)}
            </span>
          </div>
        ))}
        {!members.length && <div className="py-10 text-center text-sm text-zinc-500">No gem snapshots yet — they accumulate as the Profiles page is viewed.</div>}
      </div>
    </div>
  );
}

function TimelineTab({ points }: { points: WarTimelinePoint[] }) {
  const data = points.filter((p) => p.points !== null);
  if (!data.length) {
    return <div className="mt-4 rounded-2xl border border-dashed border-white/10 py-14 text-center text-sm text-zinc-500">No war timeline snapshots yet.</div>;
  }
  const maxPoints = Math.max(...data.map((p) => p.points ?? 0), 1);
  const minTime = data[0].time;
  const maxTime = data[data.length - 1].time;
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <h3 className="mb-3 text-sm font-bold text-white">War placement timeline</h3>
      <div className="flex h-40 items-end gap-0.5">
        {data.map((p, i) => {
          const h = Math.max(((p.points ?? 0) / maxPoints) * 100, 2);
          const timeLabel = new Date(p.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={i} className="group relative flex-1" title={`${timeLabel} · ${fmt(p.points)} pts · #${p.rank ?? "?"}`}>
              <div className="absolute -top-6 hidden whitespace-nowrap rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] group-hover:block">{fmt(p.points)} · #{p.rank ?? "?"}</div>
              <div className="rounded-t bg-violet-500/70" style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{new Date(minTime).toLocaleDateString()} {new Date(minTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <span>{new Date(maxTime).toLocaleDateString()} {new Date(maxTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}
