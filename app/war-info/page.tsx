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

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--foreground)]/60">{sub}</p> : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[2rem] border p-5 sm:p-6 backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--card) 92%, transparent)",
      }}
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">{title}</p>
        {subtitle ? <p className="mt-1 text-sm text-[var(--foreground)]/65">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ProgressBar({ value }: { value: number | null }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div>
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
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <AnimatedBackground />
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            Loading War Info...
          </div>
        </div>
      </main>
    );
  }

  if (!war) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <AnimatedBackground />
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            No war data available right now.
          </div>
        </div>
      </main>
    );
  }

  const warTitle = war.warName ?? "War Info";
  const dateRange = `${formatDateTime(war.startTime)} — ${formatDateTime(war.endTime)}`;
  const progressText = progress === null ? "—" : `${progress.toFixed(1)}%`;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="space-y-6 animate-fade-in">
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

                  <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">
                    {warTitle}
                  </h1>

                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]/70">
                    {dateRange}
                  </p>
                </div>

                <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:w-[440px]">
                  <MetricCard label="Placement" value={placement} />
                  <MetricCard
                    label="Countdown"
                    value={timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"}
                    sub={war.state === "live" ? "Until war ends" : "War completed"}
                  />
                </div>
              </div>
            </div>
          </section>

          <Section title="Battle progress">
            <div className="space-y-5">
              <ProgressBar value={progress} />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Starts" value={formatDateTime(war.startTime)} />
                <MetricCard label="Ends" value={formatDateTime(war.endTime)} />
                <MetricCard label="Duration" value={durationText} />
                <MetricCard label="Status" value={status} />
              </div>
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <Section title="Clan summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Current placement" value={placement} />
                <MetricCard label="Total points" value={formatNumber(war.totalPoints)} />
                <MetricCard label="Total clans" value={formatNumber(war.totalClans)} />
                <MetricCard label="Participants" value={formatNumber(war.participants)} />
              </div>
            </Section>

            <Section title="Battle details">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Battle ID" value={war.battleId ?? "—"} />
                <MetricCard label="Battle status" value={status} />
                <MetricCard label="Progress" value={progressText} />
                <MetricCard label="Max participants" value={formatNumber(war.maxParticipants)} />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
