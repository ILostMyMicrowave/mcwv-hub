"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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

// CountUp component - matches contributions page
function CountUp({
  value,
  formatter,
}: {
  value: number;
  formatter: (v: number) => string;
}) {
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
function Panel({
  title,
  children,
  right,
  delay = "0ms",
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  delay?: string;
}) {
  return (
    <section
      className="rounded-3xl border p-4 backdrop-blur sm:p-6"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
        opacity: 0,
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          {title}
        </h2>
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
}: {
  title: string;
  value: string | number;
  sub?: string;
  animate?: boolean;
  numericValue?: number;
  delay?: string;
}) {
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

function StateChip({ state, refreshing }: { state: string; refreshing: boolean }) {
  const live = state === "live";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
      style={{
        borderColor: live ? "color-mix(in srgb, var(--primary) 28%, transparent)" : "var(--border)",
        background: live ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "rgba(255,255,255,0.04)",
        color: "var(--foreground)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: refreshing ? "var(--accent)" : live ? "var(--primary)" : "rgba(255,255,255,0.45)",
          boxShadow: live ? "0 0 12px var(--glow)" : "none",
        }}
      />
      {refreshing ? "Updating" : stateLabel(state as WarApiData["state"])}
    </span>
  );
}

function ProgressBar({ value }: { value: number | null }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div className="transition-opacity duration-500">
      <div className="h-3 overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full rounded-full transition-all duration-500 animate-gradientMove gradient-bar"
          style={{
            width: `${safe}%`,
            background: "linear-gradient(90deg, var(--primary), var(--accent), var(--primary))",
            boxShadow: "0 0 20px var(--glow)",
            backgroundSize: "200% 200%",
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--foreground)]/55">
        <span>{value === null ? "—" : `${safe.toFixed(1)}% complete`}</span>
        <span>Live progress</span>
      </div>
    </div>
  );
}

function PageStyles() {
  return (
    <style jsx>{`
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes gradientMove {
        0% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0% 50%;
        }
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .animate-gradientMove {
        animation: gradientMove 3s ease infinite;
      }

      .animate-fade-in {
        animation: fadeInUp 0.5s ease-out forwards;
      }

      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
    `}</style>
  );
}

export default function WarInfoPage() {
  const [war, setWar] = useState<WarApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          setError(null);
        } else if (initial) {
          setWar(null);
        }
      } catch (err) {
        if (alive && initial) {
          setWar(null);
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!alive) return;
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    }

    void loadWar(true);
    const timer = window.setInterval(() => void loadWar(false), 10_000);

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
        <AnimatedBackground />
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="space-y-6 animate-pulse">
            <div className="rounded-3xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="h-8 w-48 rounded bg-zinc-800/50" />
              <div className="mt-8 h-4 w-32 rounded bg-zinc-800/50" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
              <div className="h-28 rounded-2xl bg-zinc-800/50" />
            </div>
          </div>
        </div>
        <PageStyles />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
        <AnimatedBackground />
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div
            className="rounded-3xl border p-6 text-red-200"
            style={{ background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.30)" }}
          >
            {error}
          </div>
        </div>
        <PageStyles />
      </main>
    );
  }

  if (!war) {
    return (
      <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
        <AnimatedBackground />
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div
            className="rounded-3xl border p-6 text-center"
            style={{ background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.30)" }}
          >
            <svg className="mx-auto h-16 w-16 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="mt-4 text-xl font-semibold">No war data available right now.</h2>
            <p className="mt-2 text-zinc-400">Check back later or contact an officer.</p>
          </div>
        </div>
        <PageStyles />
      </main>
    );
  }

  const warTitle = war.warName ?? "War Info";
  const dateRange = `${formatDateTime(war.startTime)} — ${formatDateTime(war.endTime)}`;
  const progressText = progress === null ? "—" : `${progress.toFixed(1)}%`;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
      <AnimatedBackground />
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="space-y-6" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
          <section
            className="overflow-hidden rounded-[2rem] border backdrop-blur"
            style={{
              borderColor: "var(--border)",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 86%, transparent))",
            }}
          >
            <div className="relative p-6 sm:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.10),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.08),transparent_34%)]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/70">
                      MCWV War Info
                    </span>
                    <StateChip state={war.state} refreshing={refreshing} />
                  </div>
                  <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{warTitle}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]/70">{dateRange}</p>
                </div>
                <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:w-[440px]">
                  <KpiCard title="Placement" value={placement} delay="0.1s" />
                  <KpiCard
                    title="Countdown"
                    value={timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"}
                    sub={war.state === "live" ? "Until war ends" : "War completed"}
                    delay="0.15s"
                  />
                </div>
              </div>
            </div>
          </section>

          <Panel
            title="Battle progress"
            right={<span className="text-xs text-zinc-400">Clean view of the live battle status</span>}
            delay="0.2s"
          >
            <div className="space-y-5">
              <ProgressBar value={progress} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard title="Starts" value={formatDateTime(war.startTime)} delay="0.25s" />
                <KpiCard title="Ends" value={formatDateTime(war.endTime)} delay="0.3s" />
                <KpiCard title="Duration" value={durationText} delay="0.35s" />
                <KpiCard title="Status" value={status} delay="0.4s" />
              </div>
            </div>
          </Panel>

          <div
            className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]"
            style={{ animation: "fadeInUp 0.5s ease-out forwards", animationDelay: "0.25s", opacity: 0 }}
          >
            <Panel title="Clan summary" right={<span className="text-xs text-zinc-400">The important numbers only</span>} delay="0.3s">
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard title="Current placement" value={placement} delay="0.3s" />
                <KpiCard title="Total points" value={formatNumber(war.totalPoints)} animate numericValue={Number(war.totalPoints)} delay="0.35s" />
                <KpiCard title="Total clans" value={formatNumber(war.totalClans)} animate numericValue={Number(war.totalClans)} delay="0.4s" />
                <KpiCard title="Participants" value={formatNumber(war.participants)} animate numericValue={Number(war.participants)} delay="0.45s" />
              </div>
            </Panel>

            <Panel title="Battle details" right={<span className="text-xs text-zinc-400">Just enough context without noise</span>} delay="0.3s">
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard title="Battle ID" value={war.battleId ?? "—"} delay="0.3s" />
                <KpiCard title="Battle status" value={status} delay="0.35s" />
                <KpiCard title="Progress" value={progressText} delay="0.4s" />
                <KpiCard title="Max participants" value={formatNumber(war.maxParticipants)} animate numericValue={Number(war.maxParticipants)} delay="0.45s" />
              </div>
            </Panel>
          </div>
        </div>
      </div>
      <PageStyles />
    </main>
  );
}
