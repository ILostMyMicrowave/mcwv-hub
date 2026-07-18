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

function Card({
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
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">
          {title}
        </p>
        {subtitle ? <p className="mt-1 text-sm text-[var(--foreground)]/65">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

export default function WarInfoPage() {
  const [war, setWar] = useState<WarApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    let intervalId: number | null = null;

    async function loadWar(initial = false) {
      if (initial) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await fetch("/api/war", { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!mounted) return;

        if (json?.success) {
          setWar(json);
        } else if (initial) {
          setWar(null);
        }
      } catch {
        if (mounted && initial) {
          setWar(null);
        }
      } finally {
        if (!mounted) return;
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    }

    loadWar(true);
    intervalId = window.setInterval(() => {
      void loadWar(false);
    }, 10_000);

    return () => {
      mounted = false;
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  const startMs = toMs(war?.startTime ?? null);
  const endMs = toMs(war?.endTime ?? null);
  const valid = startMs !== null && endMs !== null && endMs > startMs;
  const timeLeftMs = valid ? Math.max(0, endMs - now) : null;
  const computedProgress = valid ? Math.min(100, ((now - startMs) / (endMs - startMs)) * 100) : null;
  const progress = war?.progressPct ?? computedProgress;
  const state = war?.state ?? (war?.active ? "live" : "inactive");
  const finalPlacement = placementLabel(war?.clanRank ?? null);
  const statusText = valid ? stateLabel(state) : "Completed";
  const durationText = valid ? formatDuration(endMs - startMs) : "—";

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

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="space-y-6 animate-fade-in">
          <section
            className="rounded-[2rem] border p-6 sm:p-7 backdrop-blur"
            style={{
              borderColor: "var(--border)",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 86%, transparent))",
            }}
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      borderColor: "color-mix(in srgb, var(--primary) 28%, transparent)",
                      background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                      color: "var(--foreground)",
                    }}
                  >
                    {refreshing ? "Updating" : statusText}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/70">
                    {war.warName ?? "No Active War"}
                  </span>
                </div>

                <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">
                  {war.warName ?? "No Active War"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--foreground)]/70">
                  {formatDateTime(war.startTime)} — {formatDateTime(war.endTime)}
                </p>
              </div>

              <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 lg:w-[420px]">
                <DetailPill label="Placement" value={finalPlacement} />
                <DetailPill label="Countdown" value={timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"} />
              </div>
            </div>
          </section>

          <Card title="Battle progress">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <DetailPill label="Current placement" value={finalPlacement} />
                <DetailPill label="Starts" value={formatDateTime(war.startTime)} />
                <DetailPill label="Ends" value={formatDateTime(war.endTime)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailPill label="Duration" value={durationText} />
                <DetailPill label="Status" value={statusText} />
              </div>

              <ProgressBar value={progress} />
            </div>
          </Card>

          <Card title="Battle details">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailPill label="Battle ID" value={war.battleId ?? "—"} />
              <DetailPill label="Battle status" value={statusText} />
              <DetailPill label="Live progress" value={progress === null ? "—" : `${progress.toFixed(1)}%`} />
              <DetailPill label="Total points" value={formatNumber(war.totalPoints)} />
              <DetailPill label="Total clans" value={formatNumber(war.totalClans)} />
              <DetailPill label="Reward cards" value="Removed for now" />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
