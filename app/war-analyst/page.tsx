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
    pointsLastHour?: number;
    hourlyRate: number | null;
    averageRate: number | null;
    gapAbove: number | null;
    gapBelow: number | null;
    passEstimateText?: string | null;
    threatEstimateText?: string | null;
    etaAboveMs: number | null;
    threatEtaMs: number | null;
    projectedPlacement: number | null;
    projectedBestPlacement?: number | null;
    projectedWorstPlacement?: number | null;
    predictedRank1h?: number | null;
    predictedBestRank1h?: number | null;
    predictedWorstRank1h?: number | null;
    projectedFinalPoints?: number | null;
    adjustedHourlyRate?: number | null;
    reliability?: number | null;
    disconnects24h?: number;
    disconnectPlayers24h?: number;
    disconnects1h?: number;
    inactiveMembers?: number | null;
    confidence: "low" | "medium" | "high";
    uiTone: "success" | "warning" | "danger" | "info";
  };
  nearby: Array<{
    rank: number | null;
    name: string;
    points: number;
    icon?: string | null;
    pph?: number | null;
  }>;
  finishOutlook?: {
    ready: boolean;
    expectedRank: number | null;
    bestRank: number | null;
    worstRank: number | null;
    projectedPoints: number | null;
    confidence: "low" | "medium" | "high" | "warming_up";
    reason: string;
  };
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
            width: `${safe}%`,
            background: `linear-gradient(90deg, ${accent}, var(--accent), ${accent})`,
            boxShadow: "0 0 20px var(--glow)",
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
  value,
  sub,
  delay = "0ms",
}: {
  title: string;
  value: string;
  sub?: string;
  delay?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
      style={{
        borderColor: "var(--border)",
        background: "var(--card)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
        opacity: 0,
      }}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">{title}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-400">{sub}</p> : null}
    </div>
  );
}

function ClanMiniProfile({
  clan,
  data,
  onClose,
}: {
  clan: BattleHqResponse["nearby"][number] | null;
  data: BattleHqResponse;
  onClose: () => void;
}) {
  if (!clan) return null;

  const isUs = clan.name.toLowerCase() === data.current.clanName.toLowerCase();
  const mcwv = data.nearby.find((item) => item.name.toLowerCase() === data.current.clanName.toLowerCase());
  const mcwvPoints = data.current.points;
  const mcwvPph = mcwv?.pph ?? data.stats.pointsLastHour ?? 0;
  const clanPph = clan.pph ?? 0;
  const pointDiff = clan.points - mcwvPoints;
  const absoluteGap = Math.abs(pointDiff);
  const projectedClanPoints = clan.points + clanPph;
  const projectedMcwvPoints = mcwvPoints + mcwvPph;
  const projectedDiff = projectedClanPoints - projectedMcwvPoints;
  const relation = isUs ? "This is us" : pointDiff > 0 ? "Ahead of us" : "Behind us";
  const trend = isUs
    ? "MCWV baseline"
    : projectedDiff > pointDiff
    ? "Moving away from MCWV"
    : projectedDiff < pointDiff
    ? "MCWV is closing the gap"
    : "Gap is holding steady";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close clan profile" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[var(--background)] shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.10),transparent_36%)]" />
        <div className="relative p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/35">
                <span className="text-lg font-black text-[var(--foreground)]/60">{clan.name.slice(0, 2).toUpperCase()}</span>
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
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">Clan snapshot</div>
                <h2 className="mt-1 truncate text-4xl font-black text-white">{clan.name}</h2>
                <p className="mt-1 text-sm text-[var(--foreground)]/60">{relation}</p>
              </div>
            </div>
            <button className="admin-button" onClick={onClose}>×</button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Card title="Rank" value={clan.rank === null ? "—" : `#${clan.rank}`} />
            <Card title="Battle points" value={formatNumber(clan.points)} />
            <Card title="Last hour" value={clanPph > 0 ? `+${formatNumber(Math.round(clanPph))}` : "—"} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Gap to MCWV</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {isUs ? "0" : formatNumber(absoluteGap)}
              </p>
              <p className="mt-1 text-sm text-[var(--foreground)]/65">
                {isUs ? "This is MCWV's current battle score." : pointDiff > 0 ? `${clan.name} is ahead by ${formatNumber(absoluteGap)}.` : `${clan.name} is behind by ${formatNumber(absoluteGap)}.`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">1h trend</p>
              <p className="mt-2 text-2xl font-bold text-white">{trend}</p>
              <p className="mt-1 text-sm text-[var(--foreground)]/65">
                Projected in 1h: {formatNumber(Math.round(projectedClanPoints))} vs MCWV {formatNumber(Math.round(projectedMcwvPoints))}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Quick read</p>
            <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/75">
              {isUs
                ? `MCWV gained ${formatNumber(Math.round(mcwvPph))} points in the last 60 minutes.`
                : pointDiff > 0
                ? `To pass ${clan.name}, MCWV needs ${formatNumber(pointDiff + 1)} points. Their last-hour gain is ${formatNumber(Math.round(clanPph))}, while MCWV's is ${formatNumber(Math.round(mcwvPph))}.`
                : `${clan.name} needs ${formatNumber(absoluteGap + 1)} points to pass MCWV. Their last-hour gain is ${formatNumber(Math.round(clanPph))}, while MCWV's is ${formatNumber(Math.round(mcwvPph))}.`}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <a className="admin-button" href={`https://db.biggames.io/clans/${encodeURIComponent(clan.name)}`} target="_blank" rel="noreferrer">
              Open BIG Games Profile ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}


type ProjectionClan = {
  name: string;
  rank: number | null;
  points: number;
  pph: number;
  currentDelta: number;
  projectedDelta: number;
  color: string;
  isUs: boolean;
};

const PROJECTION_COLORS = ["#f97316", "#38bdf8", "#34d399", "#f472b6", "#facc15", "#a855f7", "#fb7185"];

function compactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function signedCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${compactNumber(value)}`;
}

function projectionOdds(data: BattleHqResponse) {
  const currentRank = data.current.rank ?? data.stats.projectedPlacement ?? 0;
  const expected = data.finishOutlook?.expectedRank ?? data.stats.projectedPlacement ?? currentRank;
  const best = data.finishOutlook?.bestRank ?? data.stats.projectedBestPlacement ?? expected;
  const worst = data.finishOutlook?.worstRank ?? data.stats.projectedWorstPlacement ?? expected;

  const low = Math.max(1, Math.min(best || expected || currentRank || 1, worst || expected || currentRank || 1));
  const high = Math.max(best || expected || currentRank || 1, worst || expected || currentRank || 1);
  const ranks = Array.from({ length: Math.max(1, high - low + 1) }, (_, index) => low + index).slice(0, 7);

  if (!data.finishOutlook?.ready || ranks.length === 1) {
    const base = [currentRank - 1, currentRank, currentRank + 1]
      .filter((rank) => rank > 0)
      .filter((rank, index, rows) => rows.indexOf(rank) === index);
    return base.map((rank) => ({ rank, pct: rank === currentRank ? 58 : 21 }));
  }

  const weights = ranks.map((rank) => 1 / (Math.abs(rank - expected) + 1));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return ranks.map((rank, index) => ({ rank, pct: Math.max(4, Math.round((weights[index] / total) * 100)) }));
}

function buildProjectionClans(data: BattleHqResponse): ProjectionClan[] {
  const currentName = data.current.clanName.toLowerCase();
  const currentPoints = data.current.points;
  const ourPph = data.stats.pointsLastHour ?? data.stats.adjustedHourlyRate ?? data.stats.hourlyRate ?? 0;
  const remainingHours = Math.max(0, (data.timing.remainingMs ?? 0) / 3_600_000);
  const base = data.nearby.length
    ? data.nearby
    : [{ rank: data.current.rank, name: data.current.clanName, points: currentPoints, pph: ourPph }];

  const sorted = [...base]
    .sort((a, b) => {
      const ar = a.rank ?? 9999;
      const br = b.rank ?? 9999;
      if (ar !== br) return ar - br;
      return b.points - a.points;
    });

  const ourIndex = sorted.findIndex((clan) => clan.name.toLowerCase() === currentName);
  const windowed = ourIndex >= 0
    ? sorted.slice(Math.max(0, ourIndex - 3), ourIndex + 4)
    : sorted.slice(0, 7);

  if (!windowed.some((clan) => clan.name.toLowerCase() === currentName)) {
    windowed.push({ rank: data.current.rank, name: data.current.clanName, points: currentPoints, pph: ourPph });
  }

  return windowed.slice(0, 7).map((clan, index) => {
    const pph = clan.name.toLowerCase() === currentName ? ourPph : clan.pph ?? 0;
    const currentDelta = clan.points - currentPoints;
    const projectedDelta = currentDelta + (pph - ourPph) * remainingHours;
    return {
      name: clan.name,
      rank: clan.rank,
      points: clan.points,
      pph,
      currentDelta,
      projectedDelta,
      color: clan.name.toLowerCase() === currentName ? "#fb923c" : PROJECTION_COLORS[index % PROJECTION_COLORS.length],
      isUs: clan.name.toLowerCase() === currentName,
    };
  });
}

function ProjectionGraph({ data }: { data: BattleHqResponse }) {
  const clans = buildProjectionClans(data);
  const our = clans.find((clan) => clan.isUs) ?? clans[0];
  const remainingMs = data.timing.remainingMs ?? 0;
  const remainingHours = Math.max(0, remainingMs / 3_600_000);
  const width = 820;
  const height = 330;
  const left = 70;
  const right = 125;
  const top = 22;
  const bottom = 48;
  const nowX = left + 245;
  const finishX = width - right;
  const startX = left;
  const plotHeight = height - top - bottom;

  const deltas = clans.flatMap((clan) => {
    const backDelta = clan.currentDelta - (clan.pph - (our?.pph ?? 0)) * 12;
    return [backDelta, clan.currentDelta, clan.projectedDelta];
  });
  const maxAbs = Math.max(1, ...deltas.map((value) => Math.abs(value))) * 1.25;
  const yFor = (value: number) => top + (maxAbs - value) / (maxAbs * 2) * plotHeight;
  const yTicks = [maxAbs * 0.75, maxAbs * 0.25, -maxAbs * 0.25, -maxAbs * 0.75];
  const ourY = yFor(our?.projectedDelta ?? 0);
  const band = Math.max(18, Math.min(70, Math.abs((our?.pph ?? 0) * remainingHours * 0.16) / maxAbs * plotHeight));

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-3 sm:p-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[330px] w-full">
        <defs>
          <linearGradient id="mcwvProjectionBand" x1="0" x2="1">
            <stop offset="0" stopColor="#fb923c" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fb923c" stopOpacity="0.22" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={finishX} y1={yFor(tick)} y2={yFor(tick)} stroke="rgba(255,255,255,0.08)" />
            <text x={left - 12} y={yFor(tick) + 5} textAnchor="end" fill="rgba(226,232,240,0.62)" fontSize="13">
              {signedCompact(tick)}
            </text>
          </g>
        ))}

        <line x1={nowX} x2={nowX} y1={top} y2={height - bottom} stroke="rgba(255,255,255,0.22)" strokeDasharray="6 8" />
        <line x1={left} x2={finishX} y1={yFor(0)} y2={yFor(0)} stroke="rgba(255,255,255,0.10)" />

        <polygon
          points={`${nowX},${Math.max(top, yFor(our?.currentDelta ?? 0) - band * 0.45)} ${finishX},${Math.max(top, ourY - band)} ${finishX},${Math.min(height - bottom, ourY + band)} ${nowX},${Math.min(height - bottom, yFor(our?.currentDelta ?? 0) + band * 0.45)}`}
          fill="url(#mcwvProjectionBand)"
        />

        {clans.map((clan) => {
          const pastDelta = clan.currentDelta - (clan.pph - (our?.pph ?? 0)) * 12;
          const yPast = yFor(pastDelta);
          const yNow = yFor(clan.currentDelta);
          const yFinish = yFor(clan.projectedDelta);
          return (
            <g key={clan.name} filter={clan.isUs ? "url(#softGlow)" : undefined}>
              <line x1={startX} x2={nowX} y1={yPast} y2={yNow} stroke={clan.color} strokeWidth={clan.isUs ? 3 : 2.5} opacity={clan.isUs ? 0.95 : 0.8} />
              <line x1={nowX} x2={finishX} y1={yNow} y2={yFinish} stroke={clan.color} strokeWidth={clan.isUs ? 3 : 2.5} strokeDasharray="7 7" opacity={clan.isUs ? 0.95 : 0.72} />
              <circle cx={nowX} cy={yNow} r={clan.isUs ? 4 : 3} fill={clan.color} />
              <text x={finishX + 10} y={yFinish + 5} fill={clan.color} fontSize="13" fontWeight="700">
                {clan.rank !== null ? `#${clan.rank} ` : ""}{clan.name}{clan.isUs ? " (us)" : ""}
              </text>
            </g>
          );
        })}

        <text x={startX} y={height - 16} fill="rgba(226,232,240,0.62)" fontSize="13">12h ago</text>
        <text x={nowX - 14} y={height - 16} fill="rgba(226,232,240,0.7)" fontSize="13">now</text>
        <text x={finishX - 22} y={height - 16} fill="rgba(226,232,240,0.7)" fontSize="13">finish</text>
      </svg>
      <p className="mt-2 text-xs leading-5 text-[var(--foreground)]/55">
        Projected from nearby clan pace. Shaded band is the rough uncertainty range and narrows as battle history matures. Not a guarantee.
      </p>
    </div>
  );
}

function ProjectionSection({ data }: { data: BattleHqResponse }) {
  const odds = projectionOdds(data);
  const clans = buildProjectionClans(data);
  const currentRank = data.current.rank === null ? "—" : `#${data.current.rank}`;
  const projectedRank = data.finishOutlook?.ready && data.finishOutlook.expectedRank
    ? `#${data.finishOutlook.expectedRank}`
    : data.stats.projectedPlacement
    ? `#${data.stats.projectedPlacement}`
    : currentRank;
  const projectedPoints = data.finishOutlook?.projectedPoints ?? data.stats.projectedFinalPoints ?? null;
  const ourPace = data.stats.pointsLastHour ?? data.stats.adjustedHourlyRate ?? data.stats.hourlyRate ?? null;
  const above = clans.filter((clan) => !clan.isUs && clan.currentDelta > 0).sort((a, b) => a.currentDelta - b.currentDelta)[0] ?? null;
  const extraNeeded = above && data.timing.remainingMs
    ? Math.max(0, Math.ceil((above.points + above.pph * (data.timing.remainingMs / 3_600_000) + 1 - data.current.points) / Math.max(data.timing.remainingMs / 3_600_000, 0.1) - (ourPace ?? 0)))
    : null;

  return (
    <Panel
      title="Projection"
      delay="0.4s"
      right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--foreground)]/60">Race model</span>}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Live rank" value={currentRank} sub={`${formatNumber(data.current.points)} pts`} />
        <Card title="Projected finish" value={projectedRank} sub={projectedPoints ? `${formatNumber(projectedPoints)} projected` : data.finishOutlook?.reason ?? "Warming up"} />
        <Card title="To catch" value={above ? above.name : "—"} sub={extraNeeded !== null ? `Need +${formatNumber(extraNeeded)}/hr` : data.summary.target} />
        <Card title="Our pace" value={ourPace !== null ? `${compactNumber(ourPace)}/hr` : "—"} sub={`Last 5m context in nearby table`} />
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-200">Finishing odds</h3>
            <p className="mt-1 text-xs text-[var(--foreground)]/50">
              {data.finishOutlook?.ready ? "Based on current nearby clan pace." : "Model warming up — odds are directional only."}
            </p>
          </div>
          <span className="text-xs text-[var(--foreground)]/50">Confidence {(data.finishOutlook?.confidence ?? data.stats.confidence).replace("_", " ").toUpperCase()}</span>
        </div>
        <div className="space-y-2">
          {odds.map((item, index) => (
            <div key={item.rank} className="grid grid-cols-[4rem_1fr_3rem] items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <span className="text-sm font-bold text-[var(--foreground)]/70">{item.rank}{item.rank === 1 ? "st" : item.rank === 2 ? "nd" : item.rank === 3 ? "rd" : "th"}</span>
              <div className="h-3 overflow-hidden rounded-full bg-slate-700/40">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, item.pct)}%`,
                    background: `linear-gradient(90deg, ${PROJECTION_COLORS[index % PROJECTION_COLORS.length]}, #a855f7)`,
                  }}
                />
              </div>
              <span className="text-right text-sm font-bold text-white">{item.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <ProjectionGraph data={data} />
      </div>
    </Panel>
  );
}

export default function BattleHQPage() {
  const [data, setData] = useState<BattleHqResponse | null>(null);
  const [selectedClan, setSelectedClan] = useState<BattleHqResponse["nearby"][number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load(silent = false) {
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const res = await fetch("/api/war-analyst", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        setData(json?.success ? json : null);
      } catch {
        if (!alive) return;
        if (!silent) setData(null);
      } finally {
        if (!alive) return;
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    }

    void load(false);
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
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

  const showThreatEta = data?.stats.threatEtaMs !== null && gapBelow !== null && gapBelow > 0;
  const recentHistory = pointsHistory.slice(-6);
  const forecastRange = data?.stats.projectedBestPlacement && data?.stats.projectedWorstPlacement
    ? data.stats.projectedBestPlacement === data.stats.projectedWorstPlacement
      ? `#${data.stats.projectedBestPlacement}`
      : `#${data.stats.projectedBestPlacement}–#${data.stats.projectedWorstPlacement}`
    : data?.stats.projectedPlacement
    ? `#${data.stats.projectedPlacement}`
    : "—";
  const reliabilityPercent = Math.round((data?.stats.reliability ?? 1) * 100);
  const finishRange = data?.finishOutlook?.bestRank && data?.finishOutlook?.worstRank
    ? data.finishOutlook.bestRank === data.finishOutlook.worstRank
      ? `#${data.finishOutlook.bestRank}`
      : `#${data.finishOutlook.bestRank}–#${data.finishOutlook.worstRank}`
    : data?.finishOutlook?.expectedRank
    ? `#${data.finishOutlook.expectedRank}`
    : "Warming up";

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
                    {refreshing && (
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                        Updating
                      </span>
                    )}
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
                      title="Predicted rank in 1h"
                      value={forecastRange}
                      sub={`Confidence: ${data.stats.confidence.toUpperCase()}`}
                      delay="0.2s"
                    />
                    <Card title="Next update" value={formatDuration(nextUpdateLeft)} sub="Live refresh every 30s" delay="0.25s" />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <ProgressBar value={data.current.progressPct} accent={styles.accent} track={styles.track} />
              </div>
            </section>

            <Panel
              title="Race briefing"
              right={<span className="text-xs text-[var(--foreground)]/55">{data.summary.dataQuality ?? "Warming up"}</span>}
              delay="0.15s"
            >
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Recommendation</p>
                  <p className="mt-2 text-lg font-bold text-white">{data.summary.recommendation ?? data.summary.overview}</p>
                  <p className="mt-2 text-sm text-[var(--foreground)]/70">{data.summary.pace}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <Card title="Hourly trend" value={data.summary.momentum ?? "Collecting data"} sub="Last hour compared with the hour before" />
                  <Card title="Disconnect impact" value={data.summary.disconnectImpact ?? "Unknown"} sub={`${formatNumber(data.stats.disconnects24h ?? 0)} disconnects / 24h`} />
                </div>
              </div>
            </Panel>

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
                      <p className="mt-1 text-sm text-[var(--foreground)]/75">
                        Pass estimate: {data.stats.passEstimateText ?? etaText(data.stats.etaAboveMs)}
                      </p>
                    </div>

                    <div className="rounded-2xl border p-4" style={{ borderColor: styles.border, background: styles.soft }}>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">Closest threat</p>
                      <p className="mt-2 text-lg font-bold text-white">{data.summary.threat}</p>
                      <p className="mt-2 text-sm text-[var(--foreground)]/75">
                        Gap below: {gapBelow === null ? "—" : formatNumber(gapBelow)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--foreground)]/75">
                        Threat estimate: {data.stats.threatEstimateText ?? (showThreatEta ? etaText(data.stats.threatEtaMs) : "—")}
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
                          <button
                            key={`${clan.name}-${String(clan.rank ?? "x")}`}
                            type="button"
                            onClick={() => setSelectedClan(clan)}
                            className="flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                            style={{
                              borderColor: isUs ? styles.border : "var(--border)",
                              background: isUs ? styles.soft : "rgba(0,0,0,0.14)",
                              animation: "fadeInUp 0.4s ease-out forwards",
                              opacity: 0,
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30">
                                <span className="text-xs font-bold text-[var(--foreground)]/60">{clan.name.slice(0, 2).toUpperCase()}</span>
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
                                <p className="truncate text-sm font-semibold text-white">
                                  {clan.rank !== null ? `#${clan.rank}` : "—"} · {clan.name}
                                  {clan.pph !== null && clan.pph !== undefined && clan.pph > 0 ? (
                                    <span className="ml-2 text-xs font-medium text-[var(--foreground)]/55">• +{formatNumber(Math.round(clan.pph))} 1h</span>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-xs text-[var(--foreground)]/55">
                                  {isUs ? "MCWV" : clan.points > currentPoints ? "Ahead of us" : "Behind us"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{formatNumber(clan.points)}</p>
                              <p className="text-xs text-[var(--foreground)]/55">Battle points</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              </div>

              <div className="space-y-6">
                <ProjectionSection data={data} />
              </div>
            </div>
          </div>
        )}
      </div>

      {data && <ClanMiniProfile clan={selectedClan} data={data} onClose={() => setSelectedClan(null)} />}

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
    </main>
  );
}
