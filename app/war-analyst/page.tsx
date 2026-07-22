"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type BattleHqResponse = {
success: boolean;
active: boolean;
battleId: string | null;
battleName: string | null;
lastUpdatedAt: string | null;
current: {
clanName: string;
rank: number | null;
points: number;
level: number | null;
kickCooldown: string | null;
progressPct: number | null;
participants: number | null;
totalClans: number | null;
totalPoints: number | null;
};
stats: {
gain24h: number;
hourlyRate: number | null;
averageRate: number | null;
gapAbove: number | null;
gapBelow: number | null;
etaAboveMs: number | null;
threatEtaMs: number | null;
projectedPlacement: number | null;
confidence: "low" | "medium" | "high";
uiTone: "success" | "warning" | "danger" | "info";
};
nearby: Array<{
rank: number | null;
name: string;
points: number;
}>;
summary: {
overview: string;
pace: string;
target: string;
threat: string;
};
timing: {
snapshotIntervalMs: number;
nextUpdateInMs: number;
nextUpdateText: string;
};
history: {
points24h: Array<{
capturedAt: string | null;
points: number;
rank: number | null;
}>;
};
diagnostics: {
snapshotsAvailable: number;
latestSnapshotRank: number | null;
};
};

function formatNumber(value: number | null | undefined) {
if (value === null || value === undefined || !Number.isFinite(value)) return "—";
return new Intl.NumberFormat("en-GB").format(value);
}

function formatDuration(ms: number | null) {
if (ms === null) return "—";
const total = Math.max(0, Math.floor(ms / 1000));
const d = Math.floor(total / 86400);
const h = Math.floor((total % 86400) / 3600);
const m = Math.floor((total % 3600) / 60);
const s = total % 60;
if (d > 0) return ${d}d ${h}h ${m}m ${s}s;
if (h > 0) return ${h}h ${m}m ${s}s;
return ${m}m ${s}s;
}

function etaText(ms: number | null) {
if (ms === null) return "—";
if (ms < 60_000) return ~${Math.max(1, Math.round(ms / 1000))}s;
if (ms < 3_600_000) return ~${Math.round(ms / 60_000)}m;
const total = Math.max(0, Math.floor(ms / 1000));
const h = Math.floor(total / 3600);
const m = Math.floor((total % 3600) / 60);
return ~${h}h ${m}m;
}

function toneStyles(tone: BattleHqResponse["stats"]["uiTone"]) {
switch (tone) {
case "success":
return {
border: "color-mix(in srgb, var(--primary) 30%, transparent)",
soft: "color-mix(in srgb, var(--primary) 9%, transparent)",
pill: "bg-emerald-500/10 text-emerald-200 border-emerald-500/20",
accent: "var(--primary)",
track: "color-mix(in srgb, var(--primary) 15%, transparent)",
};
case "warning":
return {
border: "color-mix(in srgb, var(--primary) 24%, transparent)",
soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
pill: "bg-amber-500/10 text-amber-200 border-amber-500/20",
accent: "var(--primary)",
track: "color-mix(in srgb, var(--primary) 15%, transparent)",
};
case "danger":
return {
border: "color-mix(in srgb, var(--primary) 20%, transparent)",
soft: "color-mix(in srgb, var(--primary) 7%, transparent)",
pill: "bg-rose-500/10 text-rose-200 border-rose-500/20",
accent: "var(--primary)",
track: "color-mix(in srgb, var(--primary) 15%, transparent)",
};
default:
return {
border: "color-mix(in srgb, var(--primary) 22%, transparent)",
soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
pill: "bg-sky-500/10 text-sky-200 border-sky-500/20",
accent: "var(--primary)",
track: "color-mix(in srgb, var(--primary) 15%, transparent)",
};
}
}

// CountUp component - matches contributions page
function CountUp({ value, formatter }: { value: number; formatter: (v: number) => string }) {
const [displayValue, setDisplayValue] = useState(0);
const ref = useRef<HTMLSpanElement | null>(null);
const hasAnimated = useRef(false);

useEffect(() => {
if (hasAnimated.current) return;
const observer = new IntersectionObserver(
(entries) => {
entries.forEach((entry) => {
if (entry.isIntersecting && !hasAnimated.current) {
hasAnimated.current = true;
const start = 0;
const end = value;
const duration = 1500;
const startTime = performance.now();
const updateValue = (currentTime: number) => {
const elapsed = currentTime - startTime;
const progress = Math.min(elapsed / duration, 1);
const easeOutQuart = 1 - Math.pow(1 - progress, 4);
setDisplayValue(Math.floor(start + (end - start) * easeOutQuart));
if (progress < 1) requestAnimationFrame(updateValue);
};
requestAnimationFrame(updateValue);
observer.disconnect();
}
});
},
{ threshold: 0.5 }
);
if (ref.current) observer.observe(ref.current);
return () => observer.disconnect();
}, [value]);

return <span ref={ref}>{formatter(displayValue)}</span>;
}

// Panel component - matches contributions page
function Panel({ title, children, right, delay = "0ms" }: { title: string; children: React.ReactNode; right?: React.ReactNode; delay?: string }) {
return (
<section
className="rounded-3xl border p-4 sm:p-6"
style={{
background: "var(--card)",
borderColor: "var(--border)",
animation: "fadeInUp 0.5s ease-out forwards",
animationDelay: delay,
opacity: 0,
}}
>
<div className="mb-4 flex items-center justify-between gap-3">
<h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">{title}</h2>
{right}
</div>
{children}
</section>
);
}

// KpiCard component - matches contributions page
function KpiCard({
title,
value,
sub,
animate = false,
numericValue,
delay = "0ms",
}: { title: string; value: string | number; sub?: string; animate?: boolean; numericValue?: number; delay?: string }) {
return (
<div
className="rounded-2xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
style={{
background: "var(--card)",
borderColor: "var(--border)",
animation: "fadeInUp 0.5s ease-out forwards",
animationDelay: delay,
opacity: 0,
}}
>
<div className="text-xs uppercase tracking-[0.2em] text-zinc-400">{title}</div>
<div className="mt-2 text-2xl font-bold text-white">
{animate && numericValue !== undefined ? (
<CountUp value={numericValue} formatter={formatNumber} />
) : (
value
)}
</div>
{sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
</div>
);
}

// ProgressBar - matches contributions page
function ProgressBar({ value, accent, track }: { value: number | null; accent: string; track: string }) {
const safe = Math.max(0, Math.min(100, value ?? 0));
return (
<div className="transition-opacity duration-500">
<div className="h-3 overflow-hidden rounded-full" style={{ background: track }}>
<div
className="h-full rounded-full transition-all duration-500 animate-gradientMove gradient-bar"
style={{
width: ${safe}%,
background: linear-gradient(90deg, ${accent}, var(--accent), ${accent}),
boxShadow: "0 0 20px var(--glow)",
}}
/>
</div>
<div className="mt-2 flex items-center justify-between text-xs text-[var(--foreground)]/55">
<span>{value === null ? "—" : ${safe.toFixed(1)}% complete}</span>
<span>Live progress</span>
</div>
</div>
);
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
return (
<div
className="rounded-2xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
style={{
borderColor: "var(--border)",
background: "var(--card)",
animation: "fadeInUp 0.5s ease-out forwards",
opacity: 0,
}}
>
<p className="text-xs uppercase tracking-[0.22em] text-zinc-400">{title}</p>
<p className="mt-1 text-xl font-bold text-white">{value}</p>
{sub ? <p className="mt-1 text-xs text-zinc-400">{sub}</p> : null}
</div>
);
}

export default function BattleHQPage() {
const [data, setData] = useState<BattleHqResponse | null>(null);
const [loading, setLoading] = useState(true);
const [now, setNow] = useState(Date.now());

useEffect(() => {
async function load() {
setLoading(true);
try {
const res = await fetch("/api/war-analyst", { cache: "no-store" });
const json = await res.json().catch(() => null);
setData(json?.success ? json : null);
} catch {
setData(null);
} finally {
setLoading(false);
}
}

load();  
const timer = setInterval(load, 30_000);  
return () => clearInterval(timer);

}, []);

useEffect(() => {
const timer = setInterval(() => setNow(Date.now()), 1000);
return () => clearInterval(timer);
}, []);

const styles = useMemo(() => toneStyles(data?.stats.uiTone ?? "info"), [data?.stats.uiTone]);

const currentPoints = data?.current.points ?? 0;
const rank = data?.current.rank ?? null;
const gapAbove = data?.stats.gapAbove ?? null;
const gapBelow = data?.stats.gapBelow ?? null;
const pointsHistory = data?.history.points24h ?? [];

const nextUpdateLeft = data
? Math.max(0, data.timing.nextUpdateInMs - (now % data.timing.snapshotIntervalMs))
: null;

const enoughHistoryForRate = (data?.diagnostics.snapshotsAvailable ?? 0) >= 3;
const showRate = enoughHistoryForRate && data?.stats.hourlyRate !== null;
const showThreatEta = data?.stats.threatEtaMs !== null && gapBelow !== null && gapBelow > 0;
const recentHistory = pointsHistory.slice(-6);

return (
<main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
<AnimatedBackground />
<Navbar />

<div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">  
    {loading ? (  
      <div className="space-y-6 animate-pulse">  
        <div className="rounded-3xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>  
          <div className="h-8 w-48 rounded bg-zinc-800/50" />  
          <div className="mt-4 h-4 w-32 rounded bg-zinc-800/50" />  
        </div>  
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">  
          <div className="h-28 rounded-2xl bg-zinc-800/50" />  
          <div className="h-28 rounded-2xl bg-zinc-800/50" />  
          <div className="h-28 rounded-2xl bg-zinc-800/50" />  
          <div className="h-28 rounded-2xl bg-zinc-800/50" />  
        </div>  
      </div>  
    ) : !data ? (  
      <div className="rounded-3xl border p-6 text-center" style={{ background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.30)" }}>  
        <svg className="mx-auto h-16 w-16 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">  
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />  
        </svg>  
        <h2 className="mt-4 text-xl font-semibold">No battle data available right now.</h2>  
        <p className="mt-2 text-zinc-400">Check back later or contact an officer.</p>  
      </div>  
    ) : (  
      <div className="space-y-6" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>  
        <section  
          className="rounded-[2rem] border p-6 sm:p-7 backdrop-blur"  
          style={{  
            borderColor: styles.border,  
            background: "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 88%, transparent))",  
            animation: "fadeInUp 0.5s ease-out forwards",  
            opacity: 0,  
          }}  
        >  
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">  
            <div className="min-w-0 flex-1">  
              <div className="flex flex-wrap items-center gap-2">  
                <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: styles.accent }}>  
                  Battle HQ  
                </p>  
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.pill}`}>  
                  {data.active ? "Live" : "Inactive"}  
                </span>  
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/70">  
                  {data.battleName ?? "No Active Battle"}  
                </span>  
              </div>  

              <div className="mt-4 flex items-end gap-3">  
                <h1 className="text-3xl font-black text-white sm:text-5xl">{data.current.clanName}</h1>  
                <span className="pb-1 text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/45">  
                  {data.current.level !== null ? `Lv ${data.current.level}` : ""}  
                </span>  
              </div>  

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">  
                <Card title="Current rank" value={rank === null ? "—" : `#${rank}`} delay="0.1s" />  
                <Card  
                  title="Battle points"  
                  value={formatNumber(currentPoints)}  
                  sub={data.stats.gain24h ? `+${formatNumber(data.stats.gain24h)} in 24h` : "24h gain pending"}  
                  delay="0.15s"  
                />  
                <Card  
                  title="Projected finish"  
                  value={data.stats.projectedPlacement ? `#${data.stats.projectedPlacement}` : "—"}  
                  sub={`Confidence: ${data.stats.confidence.toUpperCase()}`}  
                  delay="0.2s"  
                />  
                <Card title="Next update" value={data.timing.nextUpdateText} sub="Auto-refresh every 5 min" delay="0.25s" />  
              </div>  
            </div>  
          </div>  

          <div className="mt-6">  
            <ProgressBar value={data.current.progressPct} accent={styles.accent} track={styles.track} />  
          </div>  
        </section>  

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">  
          <div className="space-y-6">  
            <Panel title="Position" delay="0.2s">  
              <div className="grid gap-3 sm:grid-cols-2">  
                <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>  
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Next target</p>  
                  <p className="mt-2 text-lg font-bold text-white">{data.summary.target}</p>  
                  <p className="mt-2 text-sm text-[var(--foreground)]/75">  
                    Need {gapAbove === null ? "—" : `${formatNumber(gapAbove)} more points`}  
                  </p>  
                  <p className="mt-1 text-sm text-[var(--foreground)]/75">ETA: {etaText(data.stats.etaAboveMs)}</p>  
                </div>  

                <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>  
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Closest threat</p>  
                  <p className="mt-2 text-lg font-bold text-white">{data.summary.threat}</p>  
                  <p className="mt-2 text-sm text-[var(--foreground)]/75">  
                    Gap below: {gapBelow === null ? "—" : formatNumber(gapBelow)}  
                  </p>  
                  <p className="mt-1 text-sm text-[var(--foreground)]/75">  
                    Threat ETA: {showThreatEta ? etaText(data.stats.threatEtaMs) : "—"}  
                  </p>  
                </div>  
              </div>  
            </Panel>  

            <Panel title="Nearby clans" delay="0.3s">  
              {data.nearby.length === 0 ? (  
                <p className="text-sm text-[var(--foreground)]/65">No nearby clans available yet.</p>  
              ) : (  
                <div className="space-y-2">  
                  {data.nearby.map((clan) => {  
                    const isUs = clan.name.toLowerCase() === data.current.clanName.toLowerCase();  
                    return (  
                      <div  
                        key={`${clan.name}-${String(clan.rank ?? "x")}`}  
                        className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"  
                        style={{  
                          borderColor: isUs ? styles.border : "var(--border)",  
                          background: isUs ? styles.soft : "rgba(0,0,0,0.14)",  
                          animation: "fadeInUp 0.4s ease-out forwards",  
                          opacity: 0,  
                        }}  
                      >  
                        <div className="min-w-0">  
                          <p className="truncate text-sm font-semibold text-white">  
                            {clan.rank !== null ? `#${clan.rank}` : "—"} · {clan.name}  
                          </p>  
                          <p className="mt-1 text-xs text-[var(--foreground)]/55">  
                            {isUs ? "MCWV" : clan.points > currentPoints ? "Ahead of us" : "Behind us"}  
                          </p>  
                        </div>  
                        <div className="text-right">  
                          <p className="text-sm font-bold text-white">{formatNumber(clan.points)}</p>  
                          <p className="text-xs text-[var(--foreground)]/55">Battle points</p>  
                        </div>  
                      </div>  
                    );  
                  })}  
                </div>  
              )}  
            </Panel>  
          </div>  

          <div className="space-y-6">  
            <Panel title="Performance" delay="0.4s">  
              <div className="grid gap-3 sm:grid-cols-2">  
                <Card  
                  title="24h gain"  
                  value={`+${formatNumber(data.stats.gain24h)}`}  
                  sub={showRate ? `${formatNumber(Math.round(data.stats.hourlyRate ?? 0))} / hour` : "Need more snapshots"}  
                  delay="0.4s"  
                />  
                <Card  
                  title="Forecast"  
                  value={data.stats.projectedPlacement ? `#${data.stats.projectedPlacement}` : "—"}  
                  sub={`Confidence: ${data.stats.confidence.toUpperCase()}`}  
                  delay="0.45s"  
                />  
              </div>  
            </Panel>  

            <Panel title="Snapshot history" delay="0.5s">  
              <div className="grid gap-3 sm:grid-cols-3">  
                <Card title="Snapshots" value={formatNumber(data.diagnostics.snapshotsAvailable)} delay="0.5s" />  
                <Card title="Latest rank" value={data.diagnostics.latestSnapshotRank === null ? "—" : `#${data.diagnostics.latestSnapshotRank}`} delay="0.55s" />  
                <Card title="Next update" value={formatDuration(nextUpdateLeft)} delay="0.6s" />  
              </div>  

              <div className="mt-4 space-y-2">  
                {recentHistory.length === 0 ? (  
                  <p className="text-sm text-[var(--foreground)]/65">A few more snapshots are needed before the history row becomes useful.</p>  
                ) : (  
                  recentHistory.map((row) => (  
                    <div  
                      key={`${row.capturedAt ?? "x"}-${row.points}`}  
                      className="flex items-center justify-between rounded-xl border px-3 py-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"  
                      style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.12)", animation: "fadeInUp 0.3s ease-out forwards", opacity: 0 }}  
                    >  
                      <span className="text-xs text-[var(--foreground)]/60">  
                        {row.capturedAt  
                          ? new Date(row.capturedAt).toLocaleTimeString("en-GB", {  
                              hour: "2-digit",  
                              minute: "2-digit",  
                            })  
                          : "—"}  
                      </span>  
                      <span className="text-xs font-semibold text-white">{formatNumber(row.points)}</span>  
                    </div>  
                  ))  
                )}  
              </div>  
            </Panel>  
          </div>  
        </div>  
      </div>  
    )}  
  </div>  
</main>

);
}

<style jsx>{`  
  @keyframes fadeInUp {  
    from { opacity: 0; transform: translateY(20px); }  
    to { opacity: 1; transform: translateY(0); }  
  }  
  @keyframes gradientMove {  
    0% { background-position: 0% 50%; }  
    50% { background-position: 100% 50%; }  
    100% { background-position: 0% 50%; }  
  }  
  @keyframes pulse {  
    0%, 100% { opacity: 1; }  
    50% { opacity: .5; }  
  }  
  .animate-gradientMove { animation: gradientMove 3s ease infinite; }  
  .animate-fade-in { animation: fadeInUp 0.5s ease-out forwards; }  
  .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }  
`}</style>
