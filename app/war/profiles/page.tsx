"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ReactECharts from "echarts-for-react";
import type { MemberProfile, WarTimelinePoint } from "@/lib/profiles";

type Tab = "roster" | "gems" | "detail" | "gamepass" | "improved" | "timeline";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "roster", label: "Roster", icon: "👥" },
  { id: "gems", label: "Gem Leaderboard", icon: "💎" },
  { id: "detail", label: "Member Detail", icon: "🔍" },
  { id: "gamepass", label: "Gamepass", icon: "🎟" },
  { id: "improved", label: "War Spending", icon: "💸" },
  { id: "timeline", label: "War Timeline", icon: "📈" },
];

const GEM_PRESETS = [
  { label: "< 5B", value: 5_000_000_000 },
  { label: "< 1B", value: 1_000_000_000 },
  { label: "< 100M", value: 100_000_000 },
  { label: "< 10M", value: 10_000_000 },
];

type ThemeColors = {
  background: string; foreground: string; card: string; border: string;
  primary: string; accent: string; muted: string;
};
const FALLBACK_THEME: ThemeColors = {
  background: "#0a0a0a", foreground: "#ededed", card: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.10)", primary: "#34d399", accent: "#60a5fa", muted: "#94a3b8",
};

function useThemeColors() {
  const [theme, setTheme] = useState<ThemeColors>(FALLBACK_THEME);
  useEffect(() => {
    const readTheme = () => {
      const s = getComputedStyle(document.documentElement);
      const g = (k: string, f: string) => s.getPropertyValue(k).trim() || f;
      setTheme({
        background: g("--background", FALLBACK_THEME.background),
        foreground: g("--foreground", FALLBACK_THEME.foreground),
        card: g("--card", FALLBACK_THEME.card),
        border: g("--border", FALLBACK_THEME.border),
        primary: g("--primary", FALLBACK_THEME.primary),
        accent: g("--accent", FALLBACK_THEME.accent),
        muted: g("--foreground", FALLBACK_THEME.muted),
      });
    };
    readTheme();
    const obs = new MutationObserver(readTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    window.addEventListener("resize", readTheme);
    return () => { obs.disconnect(); window.removeEventListener("resize", readTheme); };
  }, []);
  return theme;
}

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

export default function WarProfilesPage() {
  const theme = useThemeColors();
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [warTimeline, setWarTimeline] = useState<WarTimelinePoint[]>([]);
  const [warWindow, setWarWindow] = useState<{ start: string; end: string } | null>(null);
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
      .then((d) => { setMembers(d.members || []); setWarTimeline(d.warTimeline || []); setWarWindow(d.war ?? null); setLoading(false); })
      .catch((e) => { setError(e.message || "Failed to load"); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let list = members;
    if (role !== "all") list = list.filter((m) => m.role === role);
    if (conn === "connected") list = list.filter((m) => m.connected);
    if (conn === "not") list = list.filter((m) => !m.connected);
    if (search) { const q = search.toLowerCase(); list = list.filter((m) => m.username.toLowerCase().includes(q) || m.robloxId.includes(q)); }
    const gemThreshold = gemFilter ?? (gemCustom ? parseFloat(gemCustom) * 1_000_000_000 : null);
    if (gemThreshold !== null && gemThreshold > 0) list = list.filter((m) => m.connected && m.gems !== null && m.gems < gemThreshold);
    if (masteryFilter !== null && masteryFilter > 0) list = list.filter((m) => m.connected && m.masteryAverage !== null && m.masteryAverage < masteryFilter);
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
  // War spending: net gem change during the war. A negative delta means they
  // spent/burned more than they gained. Ranked so the biggest SPENDER (most
  // negative) is first — that's the "who spent the most" view.
  const improved = useMemo(
    () => members.filter((m) => m.connected && m.gemDelta !== null).sort((a, b) => (a.gemDelta ?? 0) - (b.gemDelta ?? 0)),
    [members]
  );
  const gamepassStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of connected) for (const g of m.gamepasses) counts.set(g, (counts.get(g) || 0) + 1);
    const total = Math.max(connected.length, 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n, pct: Math.round((n / total) * 100) }));
  }, [connected]);

  const clanStats = useMemo(() => {
    const withGems = connected.filter((m) => m.gems !== null);
    const totalGems = withGems.reduce((a, m) => a + (m.gems ?? 0), 0);
    const totalRobux = connected.reduce((a, m) => a + (m.robuxSpent ?? 0), 0);
    const totalEggs = connected.reduce((a, m) => a + (m.eggsHatched ?? 0), 0);
    const totalSessions = connected.reduce((a, m) => a + (m.totalSessions ?? 0), 0);
    const richest = [...withGems].sort((a, b) => (b.gems ?? 0) - (a.gems ?? 0))[0] ?? null;
    const highestMastery = [...connected].filter((m) => m.masteryAverage !== null).sort((a, b) => (b.masteryAverage ?? 0) - (a.masteryAverage ?? 0))[0] ?? null;
    return { totalGems, totalRobux, totalEggs, totalSessions, richest, highestMastery };
  }, [connected]);

  const selectedMember = selected ? members.find((m) => m.robloxId === selected) ?? null : null;

  // ---- ECharts options ----
  const gemsChart = useMemo(() => histogramOption(connected.map((m) => m.gems).filter((v): v is number => v !== null), theme), [connected, theme]);
  const masteryChart = useMemo(() => histogramOption(connected.map((m) => m.masteryAverage).filter((v): v is number => v !== null), theme), [connected, theme]);
  const connDonut = useMemo(() => donutOption([
    { name: "Connected", value: connected.length },
    { name: "Not connected", value: members.length - connected.length },
  ], theme), [connected.length, members.length, theme]);
  // Top 8 by gems — the most useful "who's richest" view.
  const topGemsChart = useMemo(() => {
    const top = [...gemBoard].slice(0, 8);
    return horizontalBarOption(
      top.map((m) => ({ name: m.username, value: m.gems ?? 0 })),
      theme
    );
  }, [gemBoard, theme]);

  // Scatter of gems vs mastery for connected members with both.
  const gemsMasteryScatter = useMemo(() => {
    const pts = connected
      .filter((m) => m.gems !== null && m.masteryAverage !== null)
      .map((m) => ({ gems: m.gems!, mastery: m.masteryAverage!, name: m.username }));
    return scatterOption(pts, theme);
  }, [connected, theme]);

  const connPct = members.length ? Math.round((connected.length / members.length) * 100) : 0;
  const totalGems = connected.reduce((a, m) => a + (m.gems ?? 0), 0);

  if (loading)
    return (
      <>
        <Navbar />
        <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
          <div className="mx-auto max-w-6xl p-4 sm:p-6">
            <div className="skeleton-shimmer h-8 w-56 rounded bg-zinc-800/50" />
            <div className="skeleton-shimmer mt-6 h-40 rounded-2xl bg-zinc-800/40" />
            <div className="skeleton-shimmer mt-4 h-64 rounded-2xl bg-zinc-800/40" />
          </div>
        </main>
      </>
    );

  if (error)
    return (
      <>
        <Navbar />
        <main className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--background)", color: "var(--foreground)" }}>
          <div className="max-w-md rounded-2xl border p-6 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-3xl">⚠️</div>
            <p className="mt-2">Couldn&apos;t load profiles: {error}</p>
            <p className="mt-1 text-sm opacity-60">You must be an officer/admin to view this.</p>
          </div>
        </main>
      </>
    );

  return (
    <>
      <Navbar />
      <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
        <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
          {/* Header */}
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--accent)" }}>
                <span className="h-px w-6" style={{ background: "var(--accent)" }} /> MCWV · Staff
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Profiles</h1>
              <p className="mt-1.5 text-sm opacity-60">Roster, gem leaderboard &amp; full PS99 stats in one place</p>
            </div>
          </header>

          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Members" value={String(members.length)} icon="👥" />
            <StatCard label="Connected" value={`${connected.length}`} sub={`${connPct}% of roster`} accent="var(--primary)" icon="🔗" />
            <StatCard label="Avg Gems" value={avgGems === null ? "—" : fmt(avgGems)} accent="var(--primary)" icon="💎" />
            <StatCard label="Avg Mastery" value={avgMastery === null ? "—" : fmt(avgMastery)} icon="🎓" />
            <StatCard label="Avg Rank" value={avgRank === null ? "—" : String(avgRank)} icon="🏅" />
            <StatCard label="Total Gems" value={fmt(totalGems)} accent="var(--accent)" icon="💰" />
          </div>

          {/* Charts */}
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartPanel title="Gems distribution" icon="📊">
              <ReactECharts option={gemsChart} style={{ height: 220 }} notMerge />
            </ChartPanel>
            <ChartPanel title="Mastery average distribution" icon="🎯">
              <ReactECharts option={masteryChart} style={{ height: 220 }} notMerge />
            </ChartPanel>
            <ChartPanel title="Connection status" icon="🔗">
              <ReactECharts option={connDonut} style={{ height: 220 }} notMerge />
            </ChartPanel>
            <ChartPanel title="Top gems" icon="🏆">
              <ReactECharts option={topGemsChart} style={{ height: 220 }} notMerge />
            </ChartPanel>
            <ChartPanel title="Gems vs Mastery" icon="🔬">
              <ReactECharts option={gemsMasteryScatter} style={{ height: 240 }} notMerge />
            </ChartPanel>
          </div>

          {/* Clan stats */}
          <div className="mt-5 overflow-hidden rounded-2xl border" style={{ background: "color-mix(in srgb, var(--card) 60%, transparent)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <span className="text-base">⚔️</span>
              <div className="text-sm font-bold uppercase tracking-[0.15em]">Clan Stats</div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
              <FunStat label="Total Gems" value={fmt(clanStats.totalGems)} icon="💎" />
              <FunStat label="Robux Spent" value={fmt(clanStats.totalRobux)} icon="💰" />
              <FunStat label="Eggs Hatched" value={fmt(clanStats.totalEggs)} icon="🥚" />
              <FunStat label="Richest" value={clanStats.richest?.username ?? "—"} icon="👑" />
              <FunStat label="Best Mastery" value={clanStats.highestMastery?.username ?? "—"} icon="🎓" />
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 mb-3 flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  tab === t.id ? "text-white shadow-lg" : "opacity-60 hover:opacity-100"
                }`}
                style={
                  tab === t.id
                    ? { background: "linear-gradient(135deg, var(--primary), var(--accent))", boxShadow: "0 4px 14px rgba(0,0,0,0.3)" }
                    : { background: "var(--card)" }
                }
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "roster" && (
            <RosterTab
              filtered={filtered} search={search} setSearch={setSearch} role={role} setRole={setRole}
              conn={conn} setConn={setConn} gemFilter={gemFilter} setGemFilter={setGemFilter}
              gemCustom={gemCustom} setGemCustom={setGemCustom} masteryFilter={masteryFilter} setMasteryFilter={setMasteryFilter}
              avgGems={avgGems} avgMastery={avgMastery}
              onSelect={(id) => { setSelected(id); setTab("detail"); }}
            />
          )}

          {tab === "gems" && <GemTab members={gemBoard} onSelect={(id) => { setSelected(id); setTab("detail"); }} />}
          {tab === "detail" && <MemberDetail members={connected} selected={selectedMember} onSelect={setSelected} />}
          {tab === "gamepass" && <GamepassTab stats={gamepassStats} members={connected} />}
          {tab === "improved" && <ImprovedTab members={improved} warWindow={warWindow} />}
          {tab === "timeline" && <TimelineTab points={warTimeline} theme={theme} />}
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value, accent, icon, sub }: { label: string; value: string; accent?: string; icon?: string; sub?: string }) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(145deg, color-mix(in srgb, ${accent || "var(--card)"} 10%, var(--background)), var(--card))`,
        borderColor: "var(--border)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
      }}
    >
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-20 blur-xl transition group-hover:opacity-40"
        style={{ background: accent || "var(--accent)" }} />
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{label}</div>
        {icon && <span className="text-base opacity-70">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-black tracking-tight" style={{ color: accent || "inherit" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] opacity-50">{sub}</div>}
    </div>
  );
}

function FunStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border p-3 transition-all duration-200 hover:bg-white/5" style={{ background: "color-mix(in srgb, var(--card) 60%, transparent)", borderColor: "var(--border)" }}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)" }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-50">{label}</div>
        <div className="truncate text-base font-black">{value}</div>
      </div>
    </div>
  );
}

function ChartPanel({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border transition-all duration-300 hover:border-white/20" style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
        {icon && <span className="text-sm opacity-70">{icon}</span>}
        <div className="text-sm font-bold">{title}</div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ---- ECharts option builders (theme-aware) ----
function baseGrid(theme: ThemeColors) {
  return {
    textStyle: { color: theme.foreground },
    grid: { left: 8, right: 8, top: 20, bottom: 4, containLabel: true },
  };
}
function histogramOption(nums: number[], theme: ThemeColors) {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.length) return { ...baseGrid(theme), title: { text: "No data", left: "center", top: "middle", textStyle: { color: theme.muted, fontSize: 13, fontWeight: "normal" } } };
  const bins = 10;
  const min = sorted[0], max = sorted[sorted.length - 1];
  const width = (max - min) / bins || 1;
  const labels: string[] = [];
  const counts: number[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = min + i * width, hi = i === bins - 1 ? max + 1 : min + (i + 1) * width;
    counts.push(sorted.filter((n) => n >= lo && n < hi).length);
    labels.push(i === bins - 1 ? `≥ ${fmt(lo)}` : fmt(lo));
  }
  return {
    ...baseGrid(theme),
    tooltip: { trigger: "axis", backgroundColor: theme.card, borderColor: theme.border, textStyle: { color: theme.foreground } },
    xAxis: { type: "category", data: labels, axisLabel: { color: theme.muted, fontSize: 10, rotate: 30 }, axisLine: { lineStyle: { color: theme.border } } },
    yAxis: { type: "value", axisLabel: { color: theme.muted }, splitLine: { lineStyle: { color: theme.border, type: "dashed" } } },
    series: [{ type: "bar", data: counts, itemStyle: { color: theme.primary, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 26 }],
  };
}
function donutOption(data: { name: string; value: number }[], theme: ThemeColors) {
  return {
    ...baseGrid(theme),
    tooltip: { trigger: "item", backgroundColor: theme.card, borderColor: theme.border, textStyle: { color: theme.foreground } },
    color: [theme.primary, theme.accent],
    legend: { bottom: 0, textStyle: { color: theme.foreground } },
    series: [{ type: "pie", radius: ["45%", "70%"], center: ["50%", "45%"], data, label: { color: theme.foreground, formatter: "{b}: {c}" }, itemStyle: { borderRadius: 6, borderColor: theme.background, borderWidth: 2 } }],
  };
}
function horizontalBarOption(data: { name: string; value: number }[], theme: ThemeColors) {  const names = data.map((d) => d.name).reverse();
  const values = data.map((d) => d.value).reverse();
  return {
    ...baseGrid(theme),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: theme.card, borderColor: theme.border, textStyle: { color: theme.foreground } },
    xAxis: { type: "value", axisLabel: { color: theme.muted, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: theme.border, type: "dashed" } } },
    yAxis: { type: "category", data: names, axisLabel: { color: theme.accent, fontSize: 10 }, axisLine: { lineStyle: { color: theme.border } } },
    series: [{ type: "bar", data: values, itemStyle: { color: theme.primary, borderRadius: [0, 3, 3, 0] }, barMaxWidth: 18, label: { show: true, position: "right", color: theme.foreground, fontSize: 10, formatter: (p: any) => fmt(p.value) } }],
  };
}

// Scatter of gems (x) vs mastery avg (y) — shows the relationship between
// wealth and progression across the roster.
function scatterOption(points: { gems: number; mastery: number; name: string }[], theme: ThemeColors) {
  return {
    ...baseGrid(theme),
    tooltip: { trigger: "item", backgroundColor: theme.card, borderColor: theme.border, textStyle: { color: theme.foreground }, formatter: (p: any) => `${p.data.name}<br/>Gems: ${fmt(p.data.gems)}<br/>Mastery: ${p.data.mastery}` },
    xAxis: { type: "value", name: "Gems", nameTextStyle: { color: theme.muted, fontSize: 10 }, axisLabel: { color: theme.muted, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: theme.border, type: "dashed" } } },
    yAxis: { type: "value", name: "Mastery", nameTextStyle: { color: theme.muted, fontSize: 10 }, axisLabel: { color: theme.muted }, splitLine: { lineStyle: { color: theme.border, type: "dashed" } } },
    series: [{
      type: "scatter", symbolSize: 12,
      data: points.map((p) => ({ value: [p.gems, p.mastery], name: p.name, gems: p.gems, mastery: p.mastery })),
      itemStyle: { color: theme.accent, opacity: 0.8 },
    }],
  };
}

type SortKey = "name" | "gems" | "mastery" | "rank" | "role";

function RosterTab(props: {
  filtered: MemberProfile[]; search: string; setSearch: (s: string) => void; role: string; setRole: (r: string) => void;
  conn: string; setConn: (c: string) => void; gemFilter: number | null; setGemFilter: (n: number | null) => void;
  gemCustom: string; setGemCustom: (s: string) => void; masteryFilter: number | null; setMasteryFilter: (n: number | null) => void;
  avgGems: number | null; avgMastery: number | null; onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    const list = [...props.filtered];
    const val = (m: MemberProfile): number | string => {
      switch (sortKey) {
        case "gems": return m.gems ?? -1;
        case "mastery": return m.masteryAverage ?? -1;
        case "rank": return m.rank ?? Number.MAX_SAFE_INTEGER;
        case "role": return m.role;
        default: return m.username.toLowerCase();
      }
    };
    list.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sortDir;
      return ((av as number) - (bv as number)) * sortDir;
    });
    return list;
  }, [props.filtered, sortKey, sortDir]);

  const toggle = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2.5 cursor-pointer select-none hover:opacity-100 ${className ?? ""}`} onClick={() => toggle(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && <span className="text-[9px]">{sortDir === 1 ? "▲" : "▼"}</span>}
      </span>
    </th>
  );

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Search name…"
          className="col-span-2 rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--accent)] sm:col-span-1" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
        <Select value={props.role} onChange={props.setRole} options={[["all", "All roles"], ["member", "Member"], ["officer", "Officer"], ["owner", "Owner"]]} />
        <Select value={props.conn} onChange={props.setConn} options={[["all", "All"], ["connected", "Connected"], ["not", "Not connected"]]} />
        <Select value={props.gemFilter === null ? "none" : String(props.gemFilter)} onChange={(v) => props.setGemFilter(v === "none" ? null : Number(v))}
          options={[["none", "Gems"], ...GEM_PRESETS.map((p) => [String(p.value), p.label] as [string, string])]} />
        <input value={props.gemCustom} onChange={(e) => props.setGemCustom(e.target.value)} placeholder="Custom < X B" inputMode="decimal"
          className="rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40 focus:border-[var(--accent)]" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
        <Select value={props.masteryFilter === null ? "none" : String(props.masteryFilter)} onChange={(v) => props.setMasteryFilter(v === "none" ? null : Number(v))}
          options={[["none", "Mastery"], ["20", "< 20"], ["30", "< 30"], ["40", "< 40"], ["50", "< 50"]]} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
        <span>Showing <b className="opacity-100">{props.filtered.length}</b> members</span>
        <span>Avg gems <b className="opacity-100">{props.avgGems === null ? "—" : fmt(props.avgGems)}</b></span>
        <span>Avg mastery <b className="opacity-100">{props.avgMastery === null ? "—" : fmt(props.avgMastery)}</b></span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.2)" }}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider opacity-50" style={{ borderColor: "var(--border)" }}>
              <Th k="name">Member</Th><Th k="role">Role</Th><Th k="gems">Gems</Th>
              <Th k="mastery">Mastery</Th><Th k="rank">Rank</Th><th className="px-3 py-2.5">Gamepass</th><th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.robloxId} className="cursor-pointer border-b transition hover:bg-white/5" style={{ borderColor: "var(--border)" }} onClick={() => props.onSelect(m.robloxId)}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.avatarUrl ?? ""} alt="" className="h-7 w-7 rounded-full ring-1 ring-white/10" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="font-semibold" style={{ color: "var(--accent)" }}>{m.username}</span>
                  </div>
                </td>
                <td className="px-3 py-2 capitalize opacity-70">{m.role}</td>
                <td className="px-3 py-2">{m.connected ? fmt(m.gems) : "—"}</td>
                <td className="px-3 py-2">{m.connected ? fmt(m.masteryAverage) : "—"}</td>
                <td className="px-3 py-2">{m.connected ? (m.rank ?? "—") : "—"}</td>
                <td className="px-3 py-2 text-xs opacity-60">{m.connected ? (m.gamepasses.length ? m.gamepasses.slice(0, 2).join(", ") : "—") : "—"}</td>
                <td className="px-3 py-2">{m.connected ? <Badge color="var(--primary)" dot>Connected</Badge> : <Badge color="var(--accent)" dot>Not connected</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="px-4 py-10 text-center text-sm opacity-50">No members match these filters.</div>}
      </div>
    </div>
  );
}



function Badge({ color, children, dot }: { color: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

function Select(props: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)}
      className="w-full rounded-xl border px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
      style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
      {props.options.map(([v, l]) => <option key={v} value={v} style={{ background: "var(--background)" }}>{l}</option>)}
    </select>
  );
}

function GemTab({ members, onSelect }: { members: MemberProfile[]; onSelect: (id: string) => void }) {
  const max = members[0]?.gems ?? 1;
  const total = members.reduce((a, m) => a + (m.gems ?? 0), 0);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="mt-4 space-y-2">
      {members.map((m, i) => {
        const share = total > 0 ? ((m.gems ?? 0) / total) * 100 : 0;
        return (
          <button key={m.robloxId} onClick={() => onSelect(m.robloxId)}
            className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-white/5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <span className="w-8 text-center text-lg">{medals[i] ?? <span className="text-sm opacity-60">#{i + 1}</span>}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.avatarUrl ?? ""} alt="" className="h-9 w-9 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold" style={{ color: "var(--accent)" }}>{m.username}</span>
                <span className="whitespace-nowrap">
                  <span className="mr-2 text-xs opacity-50">{share.toFixed(1)}%</span>
                  <span className="font-bold" style={{ color: "var(--primary)" }}>{fmt(m.gems)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded bg-white/5">
                <div className="h-1.5 rounded" style={{ width: `${Math.max(((m.gems ?? 0) / max) * 100, 4)}%`, background: "var(--primary)" }} />
              </div>
            </div>
          </button>
        );
      })}
      {!members.length && <div className="py-10 text-center text-sm opacity-50">No connected members with gem data.</div>}
    </div>
  );
}

function Rank({ value }: { value: number | null }) {
  const medals = ["🥇", "🥈", "🥉"];
  if (value === null || value === undefined) return <span className="opacity-50">—</span>;
  if (value <= 3) return <span>{medals[value - 1]} #{value}</span>;
  return <span>#{value}</span>;
}

function MemberDetail({ members, selected, onSelect }: { members: MemberProfile[]; selected: MemberProfile | null; onSelect: (id: string) => void }) {
  return (
    <div className="mt-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {members.map((m) => (
          <button key={m.robloxId} onClick={() => onSelect(m.robloxId)}
            className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition ${selected?.robloxId === m.robloxId ? "text-white" : "opacity-60 hover:opacity-100"}`}
            style={selected?.robloxId === m.robloxId ? { background: "var(--primary)" } : { background: "var(--card)" }}>
            {m.username}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="mt-3 overflow-hidden rounded-2xl border" style={{ background: "color-mix(in srgb, var(--card) 70%, transparent)", borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.avatarUrl ?? ""} alt="" className="h-16 w-16 rounded-full ring-2" style={{ boxShadow: "0 0 0 3px color-mix(in srgb, var(--primary) 40%, transparent)" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/profile/${selected.username}`} className="text-xl font-black hover:underline" style={{ color: "var(--accent)" }}>{selected.username}</Link>
                <Badge color="var(--primary)">{selected.role}</Badge>
              </div>
              <div className="mt-1 text-xs opacity-60">
                Gem delta during war: <span className={(selected.gemDelta ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>{(selected.gemDelta ?? 0) >= 0 ? "+" : ""}{fmt(selected.gemDelta)}</span>
              </div>
            </div>
          </div>
          <div className="p-5">

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Gems" value={fmt(selected.gems)} accent="var(--primary)" icon="💎" />
            <Stat label="Rank" value={selected.rank === null ? "—" : String(selected.rank)} icon="🏅" />
            <Stat label="Rank Stars" value={selected.rankStars === null ? "—" : String(selected.rankStars)} icon="⭐" />
            <Stat label="Mastery Avg" value={fmt(selected.masteryAverage)} icon="🎓" />
            <Stat label="Rebirths" value={fmt(selected.rebirths)} icon="🔄" />
            <Stat label="Eggs Hatched" value={fmt(selected.eggsHatched)} icon="🥚" />
            <Stat label="Sessions" value={fmt(selected.totalSessions)} icon="🕹️" />
            <Stat label="Zones" value={fmt(selected.zonesUnlocked)} icon="🗺️" />
            <Stat label="Achievements" value={fmt(selected.achievementsCount)} icon="🏆" />
            <Stat label="Goals" value={fmt(selected.goalsCompleted)} icon="🎯" />
            <Stat label="Robux Spent" value={fmt(selected.robuxSpent)} icon="💰" />
            <Stat label="Booth Gems" value={fmt(selected.boothDiamondsEarned)} icon="🏪" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Ultimate" value={selected.ultimate || "—"} />
            <Stat label="Hoverboard" value={selected.hoverboard || "—"} />
            <Stat label="Booth" value={selected.booth || "—"} />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-50">Masteries</div>
            {selected.mastery && Object.keys(selected.mastery).length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {Object.entries(selected.mastery).map(([name, lvl]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="truncate opacity-70">{name}</span><span className="font-semibold">{lvl}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm opacity-50">No mastery data.</div>}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-50">Equipped pets</div>
            <div className="flex flex-wrap gap-1.5">
              {selected.equippedPets.length ? selected.equippedPets.map((p, i) => (
                <span key={i} className="rounded-lg px-2 py-1 text-xs" style={{ background: "var(--card)" }}>{p}</span>
              )) : <span className="text-sm opacity-50">No equipped pet data.</span>}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-50">Gamepasses</div>
            <div className="flex flex-wrap gap-1.5">
              {selected.gamepasses.length ? selected.gamepasses.map((g, i) => (
                <span key={i} className="rounded-lg px-2 py-1 text-xs" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>{g}</span>
              )) : <span className="text-sm opacity-50">No gamepass data.</span>}
            </div>
          </div>

          <div className="mt-4 text-xs opacity-50">First join {fmtDate(selected.firstJoin)} · Last join {fmtDate(selected.lastJoin)}</div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed py-10 text-center text-sm opacity-50" style={{ borderColor: "var(--border)" }}>Select a connected member to see their full stats.</div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 transition-colors hover:bg-white/5" style={{ background: "color-mix(in srgb, var(--card) 50%, transparent)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-50">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-sm font-bold" style={{ color: accent || "inherit" }}>{value}</div>
    </div>
  );
}

function GamepassTab({ stats, members }: { stats: { name: string; count: number; pct: number }[]; members: MemberProfile[] }) {
  const top = stats.slice(0, 10);
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-bold">Gamepass coverage</h3>
        {top.length ? top.map((g) => (
          <div key={g.name} className="mb-2">
            <div className="flex justify-between text-xs">
              <span className="opacity-80">{g.name}</span><span className="opacity-50">{g.count}/{members.length} · {g.pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded" style={{ background: "var(--border)" }}>
              <div className="h-2 rounded" style={{ width: `${g.pct}%`, background: "var(--primary)" }} />
            </div>
          </div>
        )) : <div className="text-sm opacity-50">No gamepass data yet.</div>}
      </div>
      <div className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-bold">Members</h3>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {members.map((m) => (
            <Link key={m.robloxId} href={`/profile/${m.username}`} className="flex items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-white/5">
              <span style={{ color: "var(--accent)" }}>{m.username}</span>
              <span className="text-xs opacity-50">{m.gamepasses.length ? m.gamepasses.slice(0, 3).join(", ") : "—"}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImprovedTab({ members, warWindow }: { members: MemberProfile[]; warWindow: { start: string; end: string } | null }) {
  const fmtWindow = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  };
  const windowLabel = warWindow
    ? `Net gem change during the war (${fmtWindow(warWindow.start)} → ${fmtWindow(warWindow.end)}) — who spent the most`
    : "Net gem change during the war — who spent the most";

  // The biggest spender = most negative delta. Rank so most negative is #1.
  const spenders = members.filter((m) => (m.gemDelta ?? 0) < 0);
  const gainers = members.filter((m) => (m.gemDelta ?? 0) >= 0);
  const maxSpend = Math.max(...spenders.map((m) => Math.abs(m.gemDelta ?? 0)), 1);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="border-b px-4 py-2.5 text-xs opacity-50" style={{ borderColor: "var(--border)" }}>{windowLabel}</div>
      <div className="max-h-[60vh] divide-y overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        {spenders.length > 0 && (
          <>
            <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400/70">Spent the most</div>
            {spenders.map((m, i) => {
              const spent = Math.abs(m.gemDelta ?? 0);
              const pct = (spent / maxSpend) * 100;
              return (
                <div key={m.robloxId} className="flex items-center gap-3 px-4 py-2">
                  <Rank value={i + 1} />
                  <span className="w-32 truncate font-semibold" style={{ color: "var(--accent)" }}>{m.username}</span>
                  <div className="h-1.5 flex-1 rounded bg-white/5">
                    <div className="h-1.5 rounded bg-red-400/80" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right font-bold text-red-400">−{fmt(spent)}</span>
                </div>
              );
            })}
          </>
        )}

        {gainers.length > 0 && (
          <>
            <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-green-400/70">Gained the most</div>
            {gainers.map((m, i) => (
              <div key={m.robloxId} className="flex items-center gap-3 px-4 py-2">
                <Rank value={i + 1} />
                <span className="w-32 truncate font-semibold" style={{ color: "var(--accent)" }}>{m.username}</span>
                <div className="h-1.5 flex-1 rounded bg-white/5">
                  <div className="h-1.5 rounded bg-green-400/80" style={{ width: `${Math.min((m.gemDelta ?? 0) / maxSpend * 100, 100)}%` }} />
                </div>
                <span className="w-16 text-right font-bold text-green-400">+{fmt(m.gemDelta)}</span>
              </div>
            ))}
          </>
        )}

        {!spenders.length && !gainers.length && (
          <div className="py-10 text-center text-sm opacity-50">No gem snapshots yet — they accumulate as the Profiles page is viewed.</div>
        )}
      </div>
    </div>
  );
}

function TimelineTab({ points, theme }: { points: WarTimelinePoint[]; theme: ThemeColors }) {
  const data = points.filter((p) => p.points !== null);
  if (!data.length) return <div className="mt-4 rounded-2xl border border-dashed py-14 text-center text-sm opacity-50" style={{ borderColor: "var(--border)" }}>No war timeline snapshots yet.</div>;

  // Build a time axis and insert clear day-boundary separators.
  const xLabels: string[] = [];
  const yValues: number[] = [];
  const markLines: { xAxis: number; label: { show: boolean; formatter: string; color: string } }[] = [];
  let prevDay = "";
  data.forEach((p, i) => {
    const d = new Date(p.time);
    const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    if (prevDay && day !== prevDay) {
      // Put a day boundary markline at this index.
      markLines.push({ xAxis: i, label: { show: false, formatter: "", color: theme.accent } });
    }
    prevDay = day;
    const label = `${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n${day}`;
    xLabels.push(label);
    yValues.push(p.points ?? 0);
  });

  const option = {
    ...baseGrid(theme),
    tooltip: { trigger: "axis", backgroundColor: theme.card, borderColor: theme.border, textStyle: { color: theme.foreground } },
    xAxis: {
      type: "category", boundaryGap: false, data: xLabels,
      axisLabel: { color: theme.muted, fontSize: 9, interval: "auto", formatter: (v: string) => v.split("\n")[0] },
      axisLine: { lineStyle: { color: theme.border } },
    },
    yAxis: { type: "value", axisLabel: { color: theme.muted, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: theme.border, type: "dashed" } } },
    dataZoom: [{ type: "inside", start: 0, end: 100 }, { type: "slider", height: 16, bottom: 0, borderColor: theme.border, textStyle: { color: theme.muted } }],
    series: [{
      type: "line", data: yValues, smooth: true, symbol: "none",
      lineStyle: { color: theme.primary, width: 2 },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${theme.primary}44` }, { offset: 1, color: `${theme.primary}00` }] } },
      markLine: {
        symbol: "none",
        lineStyle: { color: theme.accent, width: 1, type: "dashed" },
        label: { color: theme.accent, fontSize: 9, position: "insideEndTop" },
        data: markLines.map((ml) => ({ xAxis: ml.xAxis, label: { formatter: "new day", show: true, color: theme.accent } })),
      },
    }],
  };
  return (
    <div className="mt-4 rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h3 className="mb-3 text-sm font-bold">War points timeline <span className="text-xs font-normal opacity-50">(dashed = new day)</span></h3>
      <ReactECharts option={option} style={{ height: 320 }} notMerge />
    </div>
  );
}
