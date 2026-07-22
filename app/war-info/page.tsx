"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type WarApiData = {
  success?: boolean;
  active: boolean;
  battleId: string | null;
  warName: string | null;
  startTime: number | string | null;
  endTime: number | string | null;
  durationSeconds: number | null;
  state: "inactive" | "upcoming" | "live" | "past" | string;
  clanRank: number | null;
  totalClans: number | null;
  totalPoints: number;
  participants: number;
  maxParticipants: number;
  progressPct: number | null;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function toMs(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDateTime(value: number | string | null) {
  const ms = toMs(value);
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function placementLabel(rank: number | null) {
  if (rank === null) return "Unavailable";
  return `#${rank}`;
}

function stateLabel(state: WarApiData["state"]) {
  switch (state) {
    case "live":
      return "Live";
    case "upcoming":
      return "Upcoming";
    case "past":
      return "Completed";
    default:
      return "Inactive";
  }
}

function StateChip({ state, refreshing }: { state: string; refreshing: boolean }) {
  const live = state === "live";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${live ? "animate-pulse" : ""}`}
      style={{
        background: live ? "rgba(52, 211, 153, 0.2)" : "rgba(148, 163, 184, 0.15)",
        color: live ? "#34d399" : "#94a3b8",
        border: live ? "1px solid rgba(52, 211, 153, 0.3)" : "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      {live && <span className="h-2 w-2 rounded-full" style={{ background: "#34d399" }} />}
      {refreshing ? "Updating" : stateLabel(state as WarApiData["state"])}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-5 backdrop-blur" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
      {sub ? <div className="mt-1 text-sm text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border p-4 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">{title}</h2>
        {subtitle && <span className="text-xs text-zinc-400 whitespace-nowrap">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function ProgressBar({ value }: { value: number | null }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Live progress</span>
        <span style={{ color: "var(--foreground)" }}>{value === null ? "—" : `${safe.toFixed(1)}% complete`}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${safe}%`,
            background: "linear-gradient(90deg, var(--primary), var(--accent))",
            boxShadow: "0 0 12px var(--primary)",
          }}
        />
      </div>
    </div>
  );
}

export default function WarInfoPage() {
  const [war, setWar] = useState<WarApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;

    async function loadWar(initial = false) {
      if (initial) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await fetch("/api/war", { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!alive) return;

        if (json?.success) {
          setWar(json);
        } else if (initial) {
          setWar(null);
        }
      } catch {
        if (alive && initial) setWar(null);
      } finally {
        if (!alive) return;
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    }

    void loadWar(true);
    const timer = window.setInterval(() => {
      void loadWar(false);
    }, 10_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const startMs = toMs(war?.startTime ?? null);
  const endMs = toMs(war?.endTime ?? null);
  const valid = startMs !== null && endMs !== null && endMs > startMs;
  const progressFromTime = valid ? Math.min(100, ((now - startMs) / (endMs - startMs)) * 100) : null;
  const progress = war?.progressPct ?? progressFromTime;
  const timeLeftMs = valid ? Math.max(0, endMs - now) : null;
  const durationText = valid ? formatDuration(endMs - startMs) : "—";
  const placement = placementLabel(war?.clanRank ?? null);
  const status = war ? stateLabel(war.state) : "Inactive";

  if (loading && !war) {
    return (
      <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
        <Navbar />
        <AnimatedBackground />
        <div className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-10">
          <div className="text-center animate-pulse" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
            <div className="h-8 w-48 mx-auto rounded bg-zinc-800/50" />
            <div className="mt-8 h-4 w-32 mx-auto rounded bg-zinc-800/50" />
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!war) {
    return (
      <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
        <Navbar />
        <AnimatedBackground />
        <div className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-10">
          <div className="text-center py-20" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
            <svg className="mx-auto h-16 w-16 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="mt-4 text-xl font-semibold">No war data available right now.</h2>
            <p className="mt-2 text-zinc-400">Check back later or contact an officer.</p>
          </div>
        </div>
      </main>
    );
  }

  const warTitle = war.warName ?? "War Info";
  const dateRange = `${formatDateTime(war.startTime)} — ${formatDateTime(war.endTime)}`;
  const progressText = progress === null ? "—" : `${progress.toFixed(1)}%`;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
      <Navbar />
      <AnimatedBackground />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-10">
        <header className="mb-8 text-center" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{warTitle}</h1>
          <p className="mt-2 text-zinc-400">{dateRange}</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Clan Placement" value={placement} sub={war.totalClans ? `of ${formatNumber(war.totalClans)} clans` : undefined} />
          <MetricCard label="Total Points" value={formatNumber(war.totalPoints)} sub={war.progressPct !== null ? `${progressText} complete` : undefined} />
          <MetricCard label="Participants" value={`${formatNumber(war.participants)} / ${formatNumber(war.maxParticipants)}`} sub={`Duration: ${durationText}`} />
        </div>

        <Section title="Status">
          <div className="flex flex-wrap items-center gap-3">
            <StateChip state={war.state} refreshing={refreshing} />
            {war.battleId && <span className="text-xs text-zinc-400 font-mono">Battle ID: {war.battleId}</span>}
          </div>
        </Section>

        <Section title="Progress" subtitle="Real-time war progress">
          <ProgressBar value={progress} />
          {timeLeftMs !== null && (
            <p className="mt-3 text-sm text-zinc-400">
              Time remaining: <span style={{ color: "var(--foreground)" }}>{formatDuration(timeLeftMs)}</span>
            </p>
          )}
        </Section>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
