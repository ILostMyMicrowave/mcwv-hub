"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCompact } from "@/lib/numbers";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";
import FlowNumber from "@/components/FlowNumber";

type NearbyClan = {
  rank: number | null;
  name: string;
  points: number;
  icon?: string | null;
  pph?: number | null;
};

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
  } | null;
  stats: {
    gain24h: number;
    pointsLastHour?: number | null;
    previousHourGain?: number | null;
    momentumPct?: number | null;
    hourlyRate?: number | null;
    averageRate?: number | null;
    adjustedHourlyRate?: number | null;
    reliability?: number | null;
    disconnects24h?: number;
    disconnectPlayers24h?: number;
    disconnects1h?: number;
    inactiveMembers?: number | null;
    predictedRank1h?: number | null;
    predictedBestRank1h?: number | null;
    predictedWorstRank1h?: number | null;
    bandPct?: number | null;
    gapAbove?: number | null;
    gapBelow?: number | null;
    targetName?: string | null;
    threatName?: string | null;
    targetGapTrendPer30m?: number | null;
    threatGapTrendPer30m?: number | null;
    targetPph?: number | null;
    threatPph?: number | null;
    passEstimateText?: string | null;
    threatEstimateText?: string | null;
    etaAboveMs?: number | null;
    threatEtaMs?: number | null;
    canPassTarget?: boolean | null;
    canBePassed?: boolean | null;
    projectedPlacement?: number | null;
    projectedBestPlacement?: number | null;
    projectedWorstPlacement?: number | null;
    confidence: "low" | "medium" | "high";
    uiTone: "success" | "warning" | "danger" | "info";
  };
  nearby: NearbyClan[];
  summary: {
    overview: string;
    pace: string;
    target: string;
    threat: string;
    recommendation?: string;
    dataQuality?: string;
    momentum?: string;
    disconnectImpact?: string;
  };
  finishOutlook?: {
    ready: boolean;
    expectedRank: number | null;
    bestRank: number | null;
    worstRank: number | null;
    projectedPoints: number | null;
    confidence: "low" | "medium" | "high" | "warming_up";
    trackedClans?: number;
    dataSpanHours?: number;
    remainingHours?: number;
    reason: string;
  };
  timing: {
    snapshotIntervalMs: number;
    nextUpdateInMs: number;
    nextUpdateText: string;
    remainingMs?: number | null;
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
    clanTracks?: number;
    rateCoveragePct?: number;
    historySpanMinutes?: number;
  };
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return formatCompact(value);
}

function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

function etaText(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms <= 0) return "now";
  if (ms < 60_000) return `~${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `~${Math.round(ms / 60_000)}m`;
  return `~${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
}

function signedNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return null;
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`;
}

function rankLabel(rank: number) {
  return `#${rank}`;
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

function Panel({
  title,
  children,
  right,
  delay = "0ms",
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  delay?: string;
}) {
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
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <h2 className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300 sm:text-sm sm:tracking-[0.2em]">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function StatTile({
  title,
  value,
  sub,
  numericValue,
  numericPrefix,
  tone,
  delay = "0ms",
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  numericValue?: number | null;
  numericPrefix?: string;
  tone?: string;
  delay?: string;
}) {
  return (
    <div
      className="shine-sweep glow-spin min-w-0 rounded-2xl border p-3 backdrop-blur transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)] sm:p-4"
      style={{
        borderColor: "var(--border)",
        background: "rgba(0,0,0,0.18)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
        opacity: 0,
      }}
    >
      <div className="truncate text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:text-xs sm:tracking-[0.2em]">{title}</div>
      <div className="mt-1.5 truncate text-xl font-bold text-white sm:mt-2 sm:text-2xl" style={tone ? { color: tone } : undefined}>
        {numericValue !== undefined && numericValue !== null ? (
          <FlowNumber value={numericValue} prefix={numericPrefix} format={{ notation: "compact", maximumFractionDigits: 2 }} />
        ) : (
          value
        )}
      </div>
      {sub ? <div className="mt-1 truncate text-[11px] text-zinc-400 sm:text-xs">{sub}</div> : null}
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "info" }) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 bg-white/5 text-zinc-300",
    good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    bad: "border-rose-500/20 bg-rose-500/10 text-rose-200",
    warn: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    info: "border-sky-500/20 bg-sky-500/10 text-sky-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] sm:px-2.5 sm:text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ProgressBar({ value, accent, track }: { value: number | null; accent: string; track: string }) {
  const pct = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <div className="transition-opacity duration-500">
      <div className="h-2.5 overflow-hidden rounded-full sm:h-3" style={{ background: track }}>
        {pct !== null ? (
          <div
            className="h-full rounded-full transition-all duration-500 animate-gradientMove gradient-bar"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }}
          />
        ) : null}
      </div>
      {pct !== null ? (
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--foreground)]/55 sm:text-xs">
          <span>War progress</span>
          <span className="font-semibold text-[var(--foreground)]/75">{pct.toFixed(1)}%</span>
        </div>
      ) : null}
    </div>
  );
}

// 24h points sparkline — tiny inline SVG, no external chart library.
function Sparkline({ history, accent }: { history: BattleHqResponse["history"]["points24h"]; accent: string }) {
  const points = useMemo(
    () =>
      history
        .filter((row) => row.capturedAt && Number.isFinite(row.points))
        .map((row) => ({ t: new Date(row.capturedAt as string).getTime(), points: row.points })),
    [history]
  );

  if (points.length < 2) {
    return <div className="flex h-16 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-xs text-zinc-500">Collecting history…</div>;
  }

  const width = 320;
  const height = 64;
  const min = points[0].points;
  const max = points[points.length - 1].points;
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const x = (t: number) => ((t - tMin) / Math.max(1, tMax - tMin)) * (width - 4) + 2;
  const y = (value: number) => {
    if (max <= min) return height / 2;
    return height - 4 - ((value - min) / (max - min)) * (height - 10);
  };
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.points).toFixed(1)}`).join(" ");
  const area = `${path} L${width - 2},${height} L2,${height} Z`;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Points over the last 24 hours">
        <path d={area} fill={accent} opacity={0.12} />
        <path d={path} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points[points.length - 1].t)} cy={y(points[points.length - 1].points)} r={3} fill={accent} />
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[10px] text-zinc-500">
        <span>{new Date(points[0].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <span>{new Date(points[points.length - 1].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}

function ClanMiniProfile({
  clan,
  data,
  onClose,
}: {
  clan: NearbyClan;
  data: BattleHqResponse;
  onClose: () => void;
}) {
  const currentPoints = data.current?.points ?? 0;
  const ourPph = data.stats.pointsLastHour ?? null;
  const theirPph = clan.pph ?? null;
  const isUs = clan.name.toLowerCase() === (data.current?.clanName ?? "").toLowerCase();
  const gap = clan.points - currentPoints;
  const trendText =
    theirPph !== null && ourPph !== null
      ? theirPph > ourPph * 1.1
        ? `They are outpacing us by ${formatNumber(Math.round(theirPph - ourPph))} points/hour.`
        : theirPph < ourPph * 0.9
        ? `We are outpacing them by ${formatNumber(Math.round(ourPph - theirPph))} points/hour.`
        : "Both clans are moving at a similar pace."
      : "Not enough pace history for this clan yet.";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close clan profile" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[var(--background)] shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.10),transparent_36%)]" />
        <div className="relative p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/35 sm:h-20 sm:w-20 sm:rounded-3xl">
                <span className="text-sm font-black text-[var(--foreground)]/60 sm:text-lg">{clan.name.slice(0, 2).toUpperCase()}</span>
                {clan.icon ? (
                  <img
                    src={clan.icon}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300 sm:text-xs sm:tracking-[0.24em]">Clan snapshot</div>
                <h2 className="mt-1 truncate text-2xl font-black text-white sm:text-4xl">{clan.name}</h2>
                <p className="mt-1 text-xs text-[var(--foreground)]/60 sm:text-sm">
                  {isUs ? "This is us" : clan.points > currentPoints ? "Ahead of us" : "Behind us"}
                </p>
              </div>
            </div>
            <button className="admin-button shrink-0" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50">Rank</p>
              <p className="mt-1.5 text-lg font-bold text-white sm:text-xl">{clan.rank !== null ? `#${clan.rank}` : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50">Points</p>
              <p className="mt-1.5 text-lg font-bold text-white sm:text-xl">{formatNumber(clan.points)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50">Last hour</p>
              <p className="mt-1.5 text-lg font-bold text-white sm:text-xl">{clan.pph ? `+${formatNumber(clan.pph)}` : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50">Gap to us</p>
              <p className="mt-1.5 text-lg font-bold text-white sm:text-xl">{isUs ? "—" : signedNumber(gap) ?? "0"}</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Quick read</p>
            <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/75">{trendText}</p>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <a
              className="admin-button"
              href={`https://db.biggames.io/clans/${encodeURIComponent(clan.name)}`}
              target="_blank"
              rel="noreferrer"
            >
              View on BIG Games
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── projection graph (responsive) ───────────────────────────────────────────

type GraphClan = {
  name: string;
  color: string;
  isUs: boolean;
  history: Array<{ t: number; points: number }>;
  projected: number | null;
};

const GRAPH_COLORS = ["#facc15", "#38bdf8", "#f472b6", "#4ade80", "#fb923c", "#a78bfa", "#f87171", "#2dd4bf"];

function ProjectionGraph({ clans, remainingHours }: { clans: GraphClan[]; remainingHours: number | null }) {
  const width = 900;
  const height = 320;
  const padding = { top: 18, right: 86, bottom: 14, left: 12 };

  const allValues = clans.flatMap((clan) => [
    ...clan.history.map((point) => point.points),
    ...(clan.projected !== null ? [clan.projected] : []),
  ]);
  if (!allValues.length || clans.every((clan) => clan.history.length === 0)) {
    return (
      <p className="flex h-[200px] items-center justify-center text-sm text-[var(--foreground)]/50">
        The race graph appears once we have a few snapshots of pace history.
      </p>
    );
  }

  const now = Date.now();
  const tMin = Math.min(...clans.flatMap((clan) => clan.history.map((point) => point.t)).filter((t) => Number.isFinite(t)), now - 60 * 60_000);
  const tMax = remainingHours && remainingHours > 0.1 ? now + remainingHours * 3_600_000 : now + 60 * 60_000;
  const vMin = Math.min(...allValues);
  const vMax = Math.max(...allValues);
  const vPad = (vMax - vMin) * 0.08 || 1_000;

  const x = (t: number) => padding.left + ((t - tMin) / Math.max(1, tMax - tMin)) * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + (1 - (value - (vMin - vPad)) / ((vMax + vPad) - (vMin - vPad))) * (height - padding.top - padding.bottom);

  const yTicks = [vMin - vPad + 0, (vMin - vPad + vMax + vPad) / 2, vMax + vPad].map(y);

  return (
    <div className="shine-sweep overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-2 sm:p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full sm:h-[320px]" role="img" aria-label="Race projection graph">
        {yTicks.map((tickY, index) => (
          <g key={index}>
            <line x1={padding.left} x2={width - padding.right} y1={tickY} y2={tickY} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={width - padding.right + 6} y={tickY + 4} fill="rgba(255,255,255,0.4)" fontSize={20}>
              {formatCompact([vMin - vPad, (vMin - vPad + vMax + vPad) / 2, vMax + vPad][index])}
            </text>
          </g>
        ))}
        <line x1={x(now)} x2={x(now)} y1={padding.top - 6} y2={height - padding.bottom} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="6 6" />
        <text x={x(now) + 4} y={padding.top + 4} fill="rgba(255,255,255,0.45)" fontSize={20}>now</text>

        {clans.map((clan) => {
          if (clan.history.length === 0) return null;
          const path = clan.history.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.points).toFixed(1)}`).join(" ");
          const latest = clan.history[clan.history.length - 1];
          const projection =
            clan.projected !== null && remainingHours && remainingHours > 0.1 ? (
              <line
                className="chart-draw"
                x1={x(latest.t)}
                y1={y(latest.points)}
                x2={x(now + remainingHours * 3_600_000)}
                y2={y(clan.projected)}
                stroke={clan.color}
                strokeWidth={clan.isUs ? 2.5 : 1.8}
                strokeDasharray="8 7"
                opacity={0.55}
              />
            ) : null;

          return (
            <g key={clan.name}>
              <path d={path} fill="none" stroke={clan.color} strokeWidth={clan.isUs ? 3 : 2.2} opacity={clan.isUs ? 0.95 : 0.75} strokeLinejoin="round" strokeLinecap="round" />
              {projection}
              <circle className="chart-fade" cx={x(latest.t)} cy={y(latest.points)} r={clan.isUs ? 5 : 3.5} fill={clan.color} />
              {clan.isUs ? (
                <text x={x(latest.t) - 8} y={y(latest.points) - 12} fill={clan.color} fontSize={22} fontWeight={700} textAnchor="end">
                  us
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {clans.map((clan) => (
          <span key={clan.name} className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--foreground)]/60 sm:text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: clan.color }} />
            <span className="truncate">{clan.isUs ? `${clan.name} (us)` : clan.name}</span>
          </span>
        ))}
        <span className="text-[11px] text-[var(--foreground)]/40 sm:text-xs">Dashed lines = pace forecast to war end</span>
      </div>
    </div>
  );
}

// ── odds (triangular distribution across best..expected..worst) ─────────────

function projectionOdds(data: BattleHqResponse) {
  const expected = data.finishOutlook?.expectedRank ?? data.stats.predictedRank1h ?? null;
  const best = data.finishOutlook?.bestRank ?? data.stats.predictedBestRank1h ?? null;
  const worst = data.finishOutlook?.worstRank ?? data.stats.predictedWorstRank1h ?? null;
  if (expected === null) return [];

  const lo = Math.max(1, Math.min(best ?? expected, expected));
  const hi = Math.max(worst ?? expected, expected);
  if (lo === hi) return [{ rank: expected, pct: 100 }];

  const rows: Array<{ rank: number; pct: number }> = [];
  for (let rank = lo; rank <= hi; rank += 1) {
    const weight =
      rank <= expected
        ? 1 + ((expected - rank) / Math.max(1, expected - lo)) * 1.4
        : 1 + (1 - (rank - expected) / Math.max(1, hi - expected)) * 0.2;
    rows.push({ rank, weight });
  }
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return rows
    .map((row) => ({ rank: row.rank, pct: Math.round((row.weight / total) * 100) }))
    .filter((row) => row.pct >= 1)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8);
}

export default function BattleHQPage() {
  const [data, setData] = useState<BattleHqResponse | null>(null);
  const [selectedClan, setSelectedClan] = useState<NearbyClan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);

  const load = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/war-analyst", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (json?.success) {
        setData(json as BattleHqResponse);
        setFailed(false);
      } else {
        if (!silent) setData(null);
        setFailed(true);
      }
    } catch {
      if (!mountedRef.current) return;
      if (!silent) setData(null);
      setFailed(true);
    } finally {
      if (!mountedRef.current) return;
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load(false);
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const styles = useMemo(() => toneStyles(data?.stats.uiTone ?? "info"), [data?.stats.uiTone]);

  const currentPoints = data?.current?.points ?? 0;
  const rank = data?.current?.rank ?? null;
  const gapAbove = data?.stats.gapAbove ?? null;
  const gapBelow = data?.stats.gapBelow ?? null;
  const pointsHistory = data?.history.points24h ?? [];
  const finish = data?.finishOutlook ?? null;

  const updatedMsAgo = data?.lastUpdatedAt ? now - new Date(data.lastUpdatedAt).getTime() : null;
  const nextUpdateLeft = data
    ? Math.max(0, data.timing.nextUpdateInMs - (now % data.timing.snapshotIntervalMs))
    : null;

  const forecast1hRange =
    data?.stats.predictedBestRank1h && data?.stats.predictedWorstRank1h
      ? data.stats.predictedBestRank1h === data.stats.predictedWorstRank1h
        ? rankLabel(data.stats.predictedBestRank1h)
        : `${rankLabel(data.stats.predictedBestRank1h)}–${rankLabel(data.stats.predictedWorstRank1h)}`
      : data?.stats.predictedRank1h
      ? rankLabel(data.stats.predictedRank1h)
      : "—";

  const finishRange =
    finish?.bestRank && finish?.worstRank
      ? finish.bestRank === finish.worstRank
        ? rankLabel(finish.bestRank)
        : `${rankLabel(finish.bestRank)}–${rankLabel(finish.worstRank)}`
      : finish?.expectedRank
      ? rankLabel(finish.expectedRank)
      : "Warming up";

  const odds = useMemo(() => (data ? projectionOdds(data) : []), [data]);

  const graphClans = useMemo<GraphClan[]>(() => {
    if (!data || !data.active) return [];
    const ourHistory = pointsHistory
      .filter((row) => row.capturedAt)
      .map((row) => ({ t: new Date(row.capturedAt as string).getTime(), points: row.points }));
    const ourPph = data.stats.adjustedHourlyRate ?? data.stats.pointsLastHour ?? null;
    const remainingHours = finish?.remainingHours ?? null;
    const projected = ourPph !== null && remainingHours !== null ? currentPoints + ourPph * remainingHours : null;

    const others = (data.nearby ?? [])
      .filter((clan) => clan.name.toLowerCase() !== (data.current?.clanName ?? "").toLowerCase())
      .slice(0, 5)
      .map((clan, index) => ({
        name: clan.name,
        color: GRAPH_COLORS[(index + 1) % GRAPH_COLORS.length],
        isUs: false,
        history: [] as Array<{ t: number; points: number }>,
        projected: clan.pph && remainingHours ? clan.points + clan.pph * remainingHours : null,
      }));

    // Opponent history is not shipped in the payload (it would double the
    // response size for marginal visual value) — opponents render as
    // forecast-only lines from their current points.
    const othersWithSeed = others.map((clan, index) => ({
      ...clan,
      history: [{ t: now, points: data.nearby?.[index + 1]?.points ?? 0 }],
    }));
    const nearbyByName = new Map((data.nearby ?? []).map((clan) => [clan.name.toLowerCase(), clan]));
    const seeded = others.map((clan) => {
      const source = nearbyByName.get(clan.name.toLowerCase());
      return { ...clan, history: source ? [{ t: Date.now(), points: source.points }] : [] };
    });

    const us: GraphClan = {
      name: data.current?.clanName ?? "MCWV",
      color: GRAPH_COLORS[0],
      isUs: true,
      history: ourHistory,
      projected,
    };

    void othersWithSeed;
    return [us, ...seeded];
  }, [data, pointsHistory, currentPoints, finish?.remainingHours, now]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
        {loading ? (
          <div className="space-y-4 animate-pulse sm:space-y-6">
            <div className="rounded-3xl border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="h-6 w-40 rounded bg-zinc-800/50" />
              <div className="mt-3 h-10 w-56 rounded bg-zinc-800/50" />
              <div className="mt-4 h-3 rounded bg-zinc-800/50" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <div className="h-24 rounded-2xl bg-zinc-800/50 sm:h-28" />
              <div className="h-24 rounded-2xl bg-zinc-800/50 sm:h-28" />
              <div className="h-24 rounded-2xl bg-zinc-800/50 sm:h-28" />
              <div className="h-24 rounded-2xl bg-zinc-800/50 sm:h-28" />
            </div>
          </div>
        ) : !data || !data.current ? (
          <div className="rounded-3xl border p-6 text-center sm:p-8" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.30)" }}>
            <svg className="mx-auto h-14 w-14 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="mt-4 text-lg font-semibold sm:text-xl">
              {failed ? "Could not load battle data just now." : "No battle data available right now."}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {failed
                ? "The backend is busy or briefly unreachable (this can happen during heavy war traffic). Retrying automatically every 30 seconds."
                : "Check back later or contact an officer."}
            </p>
            <button className="admin-button mt-5" onClick={() => void load(false)}>
              Retry now
            </button>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
            {/* ── hero ─────────────────────────────────────────────── */}
            <section
              className="rounded-[1.5rem] border p-4 sm:rounded-[2rem] sm:p-7 backdrop-blur"
              style={{
                borderColor: styles.border,
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 88%, transparent))",
                animation: "fadeInUp 0.5s ease-out forwards",
                opacity: 0,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-xs sm:tracking-[0.24em]" style={{ color: styles.accent }}>
                  Battle HQ
                </p>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.pill}`}>
                  {data.active ? "Live" : "Inactive"}
                </span>
                {refreshing ? (
                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                    Updating
                  </span>
                ) : null}
                {data.battleName ? (
                  <span className="max-w-full truncate rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/70">
                    {data.battleName}
                  </span>
                ) : null}
                <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-zinc-400 sm:flex">
                  {updatedMsAgo !== null ? <>Updated {formatDuration(updatedMsAgo)} ago</> : null}
                  <button className="admin-button ml-1 px-2.5! py-1! text-[11px]!" onClick={() => void load(true)}>
                    Refresh
                  </button>
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1 sm:mt-4">
                <h1 className="text-2xl font-black text-white sm:text-5xl">{data.current.clanName}</h1>
                <span className="pb-0.5 text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/45 sm:text-xs">
                  {data.current.level !== null ? `Lv ${data.current.level}` : ""}
                  {data.current.participants !== null ? ` · ${data.current.participants} participants` : ""}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <StatTile
                  title="Current rank"
                  value={rank === null ? "—" : `#${rank}`}
                  sub={data.current.totalClans ? `of ${formatNumber(data.current.totalClans)} clans` : undefined}
                  delay="0.1s"
                />
                <StatTile
                  title="Battle points"
                  value={formatNumber(currentPoints)}
                  numericValue={currentPoints}
                  sub={data.stats.gain24h ? `+${formatNumber(data.stats.gain24h)} in 24h` : "24h gain pending"}
                  delay="0.15s"
                />
                <StatTile
                  title="Predicted rank in 1h"
                  value={forecast1hRange}
                  sub={data.stats.bandPct ? `Band ±${data.stats.bandPct}% pace` : `Confidence: ${data.stats.confidence.toUpperCase()}`}
                  delay="0.2s"
                />
                <StatTile
                  title="War ends in"
                  value={formatDuration(data.timing.remainingMs ?? null)}
                  sub={`Data refresh ${formatDuration(nextUpdateLeft)}`}
                  delay="0.25s"
                />
              </div>

              <div className="mt-4 sm:mt-6">
                <ProgressBar value={data.current.progressPct} accent={styles.accent} track={styles.track} />
              </div>
            </section>

            {/* ── race briefing ────────────────────────────────────── */}
            <Panel
              title="Race briefing"
              right={
                <span className="flex items-center gap-1.5">
                  {data.summary.dataQuality ? <Chip tone={data.summary.dataQuality === "Strong" ? "good" : "info"}>{data.summary.dataQuality}</Chip> : null}
                </span>
              }
              delay="0.15s"
            >
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Recommendation</p>
                  <p className="mt-2 text-base font-bold leading-snug text-white sm:text-lg">{data.summary.recommendation ?? data.summary.overview}</p>
                  <p className="mt-2 text-sm text-[var(--foreground)]/70">{data.summary.pace}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <StatTile title="Hourly trend" value={<span className="text-base sm:text-xl">{data.summary.momentum ?? "Collecting data"}</span>} />
                  <StatTile
                    title="Disconnect impact"
                    value={<span className="text-base sm:text-xl">{data.summary.disconnectImpact ?? "Unknown"}</span>}
                    sub={`${formatNumber(data.stats.disconnects24h ?? 0)} disconnects / 24h`}
                  />
                </div>
              </div>
            </Panel>

            {/* ── pace panel ───────────────────────────────────────── */}
            <Panel
              title="Our pace"
              right={data.diagnostics.clanTracks !== undefined ? <Chip tone="info">{data.diagnostics.clanTracks} clans tracked</Chip> : null}
              delay="0.2s"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-3 sm:p-4" style={{ borderColor: styles.border, background: styles.soft }}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Last hour</p>
                    <p className="mt-2 text-xl font-black text-white sm:text-3xl">
                      <FlowNumber value={data.stats.pointsLastHour ?? 0} prefix="+" format={{ notation: "compact", maximumFractionDigits: 2 }} />
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400 sm:text-xs">points gained</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">vs previous hour</p>
                    {data.stats.momentumPct !== null && data.stats.momentumPct !== undefined ? (
                      <>
                        <p className={`mt-2 text-xl font-black sm:text-3xl ${data.stats.momentumPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {data.stats.momentumPct > 0 ? "▲" : data.stats.momentumPct < 0 ? "▼" : "▬"} {Math.abs(data.stats.momentumPct)}%
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-400 sm:text-xs">
                          {data.stats.previousHourGain ? `was +${formatNumber(data.stats.previousHourGain)}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-xl font-black text-zinc-400 sm:text-3xl">—</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Adjusted pace</p>
                    <p className="mt-2 text-xl font-black text-white sm:text-3xl">
                      {data.stats.adjustedHourlyRate !== null && data.stats.adjustedHourlyRate !== undefined
                        ? `${formatNumber(Math.round(data.stats.adjustedHourlyRate))}/h`
                        : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400 sm:text-xs">reliability {(Math.round((data.stats.reliability ?? 1) * 100))}%</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Next hour band</p>
                    <p className="mt-2 text-xl font-black text-white sm:text-3xl">{data.stats.bandPct ? `±${data.stats.bandPct}%` : "—"}</p>
                    <p className="mt-1 text-[11px] text-zinc-400 sm:text-xs">from our own pace variance</p>
                  </div>
                </div>
                <div>
                  <Sparkline history={data.history.points24h} accent={styles.accent} />
                  <p className="mt-2 text-[11px] leading-5 text-[var(--foreground)]/50 sm:text-xs">
                    Points over the tracked window. The ±{data.stats.bandPct ?? 15}% forecast band comes from the robust variance of our recent pace, not a fixed guess.
                  </p>
                </div>
              </div>
            </Panel>

            {/* ── position: target + threat ────────────────────────── */}
            <Panel title="Position" delay="0.25s">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Next target</p>
                    {data.stats.canPassTarget ? <Chip tone="good">Reachable</Chip> : <Chip tone="neutral">Hold pace</Chip>}
                  </div>
                  <p className="mt-2 truncate text-base font-bold text-white sm:text-lg">{data.stats.targetName ?? data.summary.target}</p>
                  <p className="mt-2 text-sm text-[var(--foreground)]/75">
                    Need {gapAbove === null ? "—" : `${formatNumber(gapAbove)} more points`}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground)]/75">Pass estimate: {data.stats.passEstimateText ?? etaText(data.stats.etaAboveMs)}</p>
                  {data.stats.targetGapTrendPer30m !== null && data.stats.targetGapTrendPer30m !== undefined ? (
                    <p className={`mt-2 text-xs ${data.stats.targetGapTrendPer30m < 0 ? "text-emerald-300" : "text-zinc-400"}`}>
                      Gap {data.stats.targetGapTrendPer30m < 0 ? "closing" : "growing"} {formatNumber(Math.abs(Math.round(data.stats.targetGapTrendPer30m)))} / 30m
                      {data.stats.targetPph ? ` · their pace ${formatNumber(Math.round(data.stats.targetPph))}/h` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--foreground)]/50 sm:text-xs">Closest threat</p>
                    {data.stats.canBePassed ? <Chip tone="bad">At risk</Chip> : <Chip tone="good">Safe for now</Chip>}
                  </div>
                  <p className="mt-2 truncate text-base font-bold text-white sm:text-lg">{data.stats.threatName ?? data.summary.threat}</p>
                  <p className="mt-2 text-sm text-[var(--foreground)]/75">
                    Gap below: {gapBelow === null ? "—" : formatNumber(gapBelow)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground)]/75">Threat estimate: {data.stats.threatEstimateText ?? etaText(data.stats.threatEtaMs)}</p>
                  {data.stats.threatGapTrendPer30m !== null && data.stats.threatGapTrendPer30m !== undefined ? (
                    <p className={`mt-2 text-xs ${data.stats.threatGapTrendPer30m < 0 ? "text-rose-300" : "text-zinc-400"}`}>
                      They are {data.stats.threatGapTrendPer30m < 0 ? "closing by" : "losing"} {formatNumber(Math.abs(Math.round(data.stats.threatGapTrendPer30m)))} / 30m
                      {data.stats.threatPph ? ` · their pace ${formatNumber(Math.round(data.stats.threatPph))}/h` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            </Panel>

            {/* ── nearby clans (kept element) ──────────────────────── */}
            <Panel
              title="Nearby clans"
              delay="0.3s"
              right={<span className="text-[11px] text-[var(--foreground)]/50 sm:text-xs">Tap a clan for details</span>}
            >
              {data.nearby.length === 0 ? (
                <p className="text-sm text-[var(--foreground)]/65">No nearby clans available yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.nearby.map((clan) => {
                    const isUs = clan.name.toLowerCase() === data.current?.clanName.toLowerCase();
                    return (
                      <button
                        key={`${clan.name}-${String(clan.rank ?? "x")}`}
                        type="button"
                        onClick={() => setSelectedClan(clan)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)] sm:gap-4 sm:px-4"
                        style={{
                          borderColor: isUs ? styles.border : "var(--border)",
                          background: isUs ? styles.soft : "rgba(0,0,0,0.14)",
                          animation: "fadeInUp 0.4s ease-out forwards",
                          opacity: 0,
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30 sm:h-10 sm:w-10">
                            <span className="text-[11px] font-bold text-[var(--foreground)]/60 sm:text-xs">{clan.name.slice(0, 2).toUpperCase()}</span>
                            {clan.icon ? (
                              <img
                                src={clan.icon}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-white sm:text-sm">
                              {clan.rank !== null ? `#${clan.rank}` : "—"} · {clan.name}
                              {clan.pph !== null && clan.pph !== undefined && clan.pph > 0 ? (
                                <span className="ml-1.5 text-[11px] font-medium text-[var(--foreground)]/55 sm:ml-2 sm:text-xs">• +{formatNumber(Math.round(clan.pph))} 1h</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[var(--foreground)]/55 sm:mt-1 sm:text-xs">
                              {isUs ? data.current.clanName : clan.points > currentPoints ? "Ahead of us" : "Behind us"}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-bold text-white sm:text-sm">{formatNumber(clan.points)}</p>
                          <p className="hidden text-[11px] text-[var(--foreground)]/55 sm:block sm:text-xs">Battle points</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* ── forecast ─────────────────────────────────────────── */}
            <Panel
              title="Forecast"
              right={
                <span className="text-[11px] text-[var(--foreground)]/50 sm:text-xs">
                  Confidence {(finish?.confidence ?? data.stats.confidence).replace("_", " ").toUpperCase()}
                </span>
              }
              delay="0.35s"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile title="Rank in 1h (expected)" value={data.stats.predictedRank1h ? rankLabel(data.stats.predictedRank1h) : "—"} sub={`Range ${forecast1hRange}`} />
                <StatTile
                  title="Finish (expected)"
                  value={finish?.ready && finish.expectedRank ? rankLabel(finish.expectedRank) : "Warming up"}
                  sub={finish?.ready ? `Range ${finishRange}` : "Needs 2h of pace history"}
                />
                <StatTile
                  title="Projected final points"
                  value={finish?.projectedPoints ? formatNumber(finish.projectedPoints) : "—"}
                  sub={finish?.remainingHours !== undefined && finish?.remainingHours !== null ? `${formatDuration(finish.remainingHours * 3_600_000)} of war left` : undefined}
                />
                <StatTile
                  title="Pace tracks"
                  value={data.diagnostics.clanTracks ?? "—"}
                  sub={`${data.diagnostics.rateCoveragePct ?? 0}% of nearby clans moving`}
                />
              </div>

              {finish && !finish.ready ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-[var(--foreground)]/60 sm:text-sm">
                  {finish.reason}
                </p>
              ) : (
                <>
                  <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-3 sm:p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-200 sm:text-sm sm:tracking-[0.2em]">Finishing odds</h3>
                        <p className="mt-0.5 text-[11px] text-[var(--foreground)]/50 sm:text-xs">{finish?.reason}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {odds.map((item) => (
                        <div key={item.rank} className="row-lift flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
                          <span className="w-10 shrink-0 text-sm font-bold text-[var(--foreground)]/70 sm:w-12">{rankLabel(item.rank)}</span>
                          <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${item.pct}%`,
                                background: `linear-gradient(90deg, ${styles.accent}66, ${styles.accent})`,
                              }}
                            />
                          </div>
                          <span className="w-12 shrink-0 text-right text-sm font-bold text-white sm:w-14">{item.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="mt-5">
                <ProjectionGraph clans={graphClans} remainingHours={finish?.remainingHours ?? null} />
              </div>
            </Panel>

            {/* ── data quality footer ──────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-2 text-[11px] text-[var(--foreground)]/40 sm:text-xs">
              <span>
                {data.diagnostics.snapshotsAvailable} snapshots · {data.diagnostics.historySpanMinutes ?? 0}min of history · updated{" "}
                {updatedMsAgo !== null ? `${formatDuration(updatedMsAgo)} ago` : "—"}
              </span>
              <span className="flex items-center gap-2">
                <button className="admin-button !px-3 !py-1 !text-[11px] sm:hidden" onClick={() => void load(true)}>
                  Refresh
                </button>
                Next data refresh in {formatDuration(nextUpdateLeft)}
              </span>
            </div>
          </div>
        )}
      </div>

      {selectedClan && data?.current ? <ClanMiniProfile clan={selectedClan} data={data} onClose={() => setSelectedClan(null)} /> : null}

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

        .animate-gradientMove {
          animation: gradientMove 3s ease infinite;
        }
      `}</style>
    </main>
  );
}
