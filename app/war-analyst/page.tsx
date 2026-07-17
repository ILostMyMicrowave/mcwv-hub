"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function etaText(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 60_000) return `~${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `~${Math.round(ms / 60_000)}m`;
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `~${h}h ${m}m`;
}

function toneStyles(tone: BattleHqResponse["stats"]["uiTone"]) {
  switch (tone) {
    case "success":
      return {
        border: "color-mix(in srgb, var(--primary) 30%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 9%, transparent)",
        glow: "shadow-[0_0_24px_rgba(52,211,153,0.12)]",
        pill: "bg-emerald-500/10 text-emerald-200 border-emerald-500/20",
        bar: "bg-emerald-400",
      };
    case "warning":
      return {
        border: "color-mix(in srgb, var(--primary) 24%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
        glow: "shadow-[0_0_24px_rgba(250,204,21,0.12)]",
        pill: "bg-amber-500/10 text-amber-200 border-amber-500/20",
        bar: "bg-amber-400",
      };
    case "danger":
      return {
        border: "color-mix(in srgb, var(--primary) 20%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 7%, transparent)",
        glow: "shadow-[0_0_24px_rgba(248,113,113,0.12)]",
        pill: "bg-rose-500/10 text-rose-200 border-rose-500/20",
        bar: "bg-rose-400",
      };
    default:
      return {
        border: "color-mix(in srgb, var(--primary) 22%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
        glow: "shadow-[0_0_24px_rgba(96,165,250,0.12)]",
        pill: "bg-sky-500/10 text-sky-200 border-sky-500/20",
        bar: "bg-sky-400",
      };
  }
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--card) 88%, transparent)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--foreground)]/55">{sub}</p> : null}
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
  children: ReactNode;
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

function ProgressBar({ value }: { value: number | null }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="h-3 overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full rounded-full transition-all duration-500 gradient-bar animate-gradientMove"
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
  const enoughHistoryForTrend = pointsHistory.length >= 2;
  const showRate = enoughHistoryForRate && data?.stats.hourlyRate !== null;
  const showThreatEta = data?.stats.threatEtaMs !== null && gapBelow !== null && gapBelow > 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {loading ? (
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            Loading Battle HQ...
          </div>
        ) : !data ? (
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            No battle data available right now.
          </div>
        ) : (
          <div className="space-y-6">
            <section
              className="rounded-[2rem] border p-6 sm:p-7 backdrop-blur"
              style={{
                borderColor: styles.border,
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 88%, transparent))",
              }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: styles.border }}>
                      Battle HQ
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.pill}`}
                    >
                      {data.active ? "Live" : "Inactive"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/70">
                      {data.battleName ?? "No Active Battle"}
                    </span>
                  </div>

                  <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                    {data.current.clanName}
                  </h1>

                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]/70">
                    {data.summary.overview}
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Current rank" value={rank === null ? "—" : `#${rank}`} />
                    <StatCard
                      label="Battle points"
                      value={formatNumber(currentPoints)}
                      sub={data.stats.gain24h ? `+${formatNumber(data.stats.gain24h)} in 24h` : "24h gain pending"}
                    />
                    <StatCard
                      label="Projected finish"
                      value={data.stats.projectedPlacement ? `#${data.stats.projectedPlacement}` : "—"}
                      sub={`Confidence: ${data.stats.confidence.toUpperCase()}`}
                    />
                    <StatCard label="Next update" value={data.timing.nextUpdateText} sub="Auto-refresh every 5 min" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
                  <StatCard label="Level" value={data.current.level !== null ? String(data.current.level) : "—"} />
                  <StatCard label="Kick cooldown" value={data.current.kickCooldown ?? "—"} />
                  <StatCard label="Participants" value={formatNumber(data.current.participants)} />
                  <StatCard label="Last updated" value={data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"} />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <StatCard label="Progress" value={data.current.progressPct !== null ? `${data.current.progressPct.toFixed(1)}%` : "—"} />
                <StatCard label="Total clans" value={formatNumber(data.current.totalClans)} />
                <StatCard label="Total points" value={formatNumber(data.current.totalPoints)} />
              </div>

              <div className="mt-6">
                <ProgressBar value={data.current.progressPct} />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-6">
                <Section title="Position" subtitle="Your place in the current battle and the clans around you.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Next target</p>
                      <p className="mt-2 text-lg font-bold text-white">{data.summary.target}</p>
                      <p className="mt-2 text-sm text-[var(--foreground)]/75">
                        Need {gapAbove === null ? "—" : `${formatNumber(gapAbove)} more points`}
                      </p>
                      <p className="mt-1 text-sm text-[var(--foreground)]/75">
                        ETA: {etaText(data.stats.etaAboveMs)}
                      </p>
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
                </Section>

                <Section title="Nearby clans" subtitle="Clans immediately around MCWV in the ladder.">
                  {data.nearby.length === 0 ? (
                    <p className="text-sm text-[var(--foreground)]/65">No nearby clans available yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.nearby.map((clan) => {
                        const isUs = clan.name.toLowerCase() === data.current.clanName.toLowerCase();
                        return (
                          <div
                            key={`${clan.name}-${String(clan.rank ?? "x")}`}
                            className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3"
                            style={{
                              borderColor: isUs ? styles.border : "var(--border)",
                              background: isUs ? styles.soft : "rgba(0,0,0,0.14)",
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
                </Section>
              </div>

              <div className="space-y-6">
                <Section title="Performance" subtitle="How the current battle is trending right now.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="24h gain"
                      value={`+${formatNumber(data.stats.gain24h)}`}
                      sub={showRate ? `${formatNumber(Math.round(data.stats.hourlyRate ?? 0))} / hour` : "Need more snapshots"}
                    />
                    <StatCard
                      label="Forecast"
                      value={data.stats.projectedPlacement ? `#${data.stats.projectedPlacement}` : "—"}
                      sub={`Confidence: ${data.stats.confidence.toUpperCase()}`}
                    />
                  </div>
                </Section>

                <Section title="Battle summary" subtitle="Short readout for officers.">
                  <div className="space-y-3">
                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.14)" }}>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Overview</p>
                      <p className="mt-2 text-sm leading-6 text-white">{data.summary.overview}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.14)" }}>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Pace</p>
                      <p className="mt-2 text-sm leading-6 text-white">{showRate ? data.summary.pace : "Need a few more snapshots before pace becomes reliable."}</p>
                    </div>
                  </div>
                </Section>

                <Section title="Snapshot history" subtitle="Saved points over time.">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="Snapshots" value={formatNumber(data.diagnostics.snapshotsAvailable)} />
                    <StatCard label="Latest rank" value={data.diagnostics.latestSnapshotRank === null ? "—" : `#${data.diagnostics.latestSnapshotRank}`} />
                    <StatCard label="Next update" value={formatDuration(nextUpdateLeft)} />
                  </div>

                  <div className="mt-4 space-y-2">
                    {enoughHistoryForTrend ? (
                      pointsHistory.slice(-8).map((row) => (
                        <div
                          key={`${row.capturedAt ?? "x"}-${row.points}`}
                          className="flex items-center justify-between rounded-xl border px-3 py-2"
                          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.12)" }}
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
                    ) : (
                      <p className="text-sm text-[var(--foreground)]/65">A few more snapshots are needed before the trend list becomes useful.</p>
                    )}
                  </div>
                </Section>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
