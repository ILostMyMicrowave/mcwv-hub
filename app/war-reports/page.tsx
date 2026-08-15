"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type WarReportSummary = {
  battleId: string;
  battleName: string;
  startTime: string | null;
  endTime: string | null;
  finalRank: number | null;
  finalPoints: number;
  capturedAt: string | null;
  isActive?: boolean;
  accounts: number;
  participants: number;
  zeroAccounts: number;
  averagePoints: number;
  medianPoints: number;
  topMembers: Array<{ robloxId: string; username: string; points: number }>;
};

type ReportListResponse = {
  success: boolean;
  featured: WarReportSummary | null;
  reports: WarReportSummary[];
  error?: string;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateRange(report: WarReportSummary) {
  const start = formatDate(report.startTime);
  const end = formatDate(report.endTime);
  if (start === "—" && end === "—") return "Dates unavailable";
  return `${start} → ${end}`;
}

const HISTORY_ACCURATE_SINCE_MS = Date.parse("2026-08-16T00:00:00Z");

function isPartialReport(report: WarReportSummary) {
  if (!report.endTime) return true;
  const t = new Date(report.endTime).getTime();
  return Number.isFinite(t) && t < HISTORY_ACCURATE_SINCE_MS;
}

function rankMeta(rank: number | null) {
  if (!rank) {
    return {
      tier: "UNRANKED",
      medal: "border-white/15 text-zinc-300",
      glow: "0 0 0 rgba(0,0,0,0)",
      chip: "border-white/10 bg-white/5 text-zinc-300",
    };
  }
  if (rank <= 10) {
    return {
      tier: "TOP 10 GLOBAL",
      medal: "border-yellow-300/60 text-yellow-100",
      glow: "0 0 45px rgba(250,204,21,0.28)",
      chip: "border-yellow-400/35 bg-yellow-400/12 text-yellow-100",
    };
  }
  if (rank <= 25) {
    return {
      tier: "TOP 25 GLOBAL",
      medal: "border-emerald-300/50 text-emerald-100",
      glow: "0 0 40px rgba(52,211,153,0.24)",
      chip: "border-emerald-400/35 bg-emerald-400/12 text-emerald-100",
    };
  }
  if (rank <= 50) {
    return {
      tier: "TOP 50 GLOBAL",
      medal: "border-sky-300/50 text-sky-100",
      glow: "0 0 40px rgba(56,189,248,0.22)",
      chip: "border-sky-400/35 bg-sky-400/12 text-sky-100",
    };
  }
  return {
    tier: "RANKED",
    medal: "border-violet-300/45 text-violet-100",
    glow: "0 0 36px rgba(167,139,250,0.20)",
    chip: "border-violet-400/35 bg-violet-400/12 text-violet-100",
  };
}

const PODIUM = [
  { medal: "🥇", ring: "border-yellow-300/60", halo: "0 0 34px rgba(250,204,21,0.30)", text: "text-yellow-100" },
  { medal: "🥈", ring: "border-zinc-300/50", halo: "0 0 24px rgba(212,212,216,0.20)", text: "text-zinc-100" },
  { medal: "🥉", ring: "border-amber-500/55", halo: "0 0 24px rgba(245,158,11,0.22)", text: "text-amber-100" },
];

function ParticipationBar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="wr-bar h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
        style={{ width: `${Math.max(pct > 0 ? 4 : 0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  sub,
  tone = "normal",
  barPct,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "normal" | "danger";
  barPct?: number;
}) {
  return (
    <div className="card-hover rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground)]/45">{label}</p>
      <p className={`mt-2 text-xl font-black ${tone === "danger" ? "text-rose-200" : "text-white"}`}>{value}</p>
      {typeof barPct === "number" && <ParticipationBar pct={barPct} />}
      {sub && <p className="mt-1.5 text-[11px] text-[var(--foreground)]/40">{sub}</p>}
    </div>
  );
}

function PodiumCard({
  member,
  place,
  elevated,
}: {
  member: { robloxId: string; username: string; points: number };
  place: number;
  elevated: boolean;
}) {
  const meta = PODIUM[place] ?? PODIUM[2];
  return (
    <div
      className={`shine-sweep flex flex-col items-center rounded-2xl border border-white/10 bg-black/25 px-3 pb-4 pt-5 text-center transition duration-300 hover:-translate-y-1 ${elevated ? "sm:-translate-y-3 sm:scale-[1.06]" : ""}`}
    >
      <span className="text-lg leading-none">{meta.medal}</span>
      <img
        className={`mt-2 rounded-2xl border-2 bg-black/30 ${meta.ring} ${elevated ? "h-16 w-16" : "h-12 w-12"}`}
        style={{ boxShadow: meta.halo }}
        src={`/api/roblox/avatar?userId=${encodeURIComponent(member.robloxId)}`}
        alt=""
      />
      <p className="mt-2 w-full truncate text-xs font-bold text-white">{member.username}</p>
      <p className={`text-[11px] font-bold ${meta.text}`}>{formatCompact(member.points)} pts</p>
    </div>
  );
}

function ReportCard({ report, featured = false }: { report: WarReportSummary; featured?: boolean }) {
  const href = report.isActive ? "/war-reports/current" : `/war-reports/${encodeURIComponent(report.battleId)}`;
  const hasData = report.accounts > 0;
  const participantPct = report.accounts > 0 ? Math.round((report.participants / report.accounts) * 100) : 0;
  const rank = rankMeta(report.finalRank);
  const podium = report.topMembers.slice(0, 3);
  // Podium display order on desktop: 2nd, 1st (elevated centre), 3rd.
  const podiumDisplay = [podium[1] && { member: podium[1], place: 1 }, podium[0] && { member: podium[0], place: 0 }, podium[2] && { member: podium[2], place: 2 }].filter(
    Boolean
  ) as Array<{ member: (typeof podium)[number]; place: number }>;

  return (
    <Link
      href={href}
      className={`shine-sweep glow-spin group relative block overflow-hidden rounded-[2rem] border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_45px_rgba(52,211,153,0.14)] ${featured ? "sm:p-7" : ""}`}
      style={{
        borderColor: featured ? "color-mix(in srgb, var(--primary) 44%, var(--border))" : "var(--border)",
        background: featured
          ? "linear-gradient(135deg, color-mix(in srgb, var(--primary) 16%, var(--card)), color-mix(in srgb, var(--accent) 10%, var(--card)) 55%, var(--card))"
          : "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 88%, transparent))",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.10),transparent_38%)] opacity-70 transition duration-300 group-hover:opacity-100" />
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--primary)]/10 blur-3xl" />

      <div className="relative">
        {/* Top row: badges + name + rank medal */}
        <div className={`flex gap-4 ${featured ? "flex-col sm:flex-row sm:items-center sm:justify-between" : "items-start justify-between"}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {report.isActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                  <span className="wr-pulse inline-block h-1.5 w-1.5 rounded-full bg-sky-300" />
                  Live Preview
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--foreground)]/55">
                  {featured ? "Featured Report" : formatDate(report.endTime)}
                </span>
              )}
              {report.isActive && (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground)]/55">
                  Current War
                </span>
              )}
              {!hasData && (
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">
                  Warming Up
                </span>
              )}
              {!report.isActive && isPartialReport(report) && (
                <span
                  className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100"
                  title="This war was captured after the game API began removing contributors — member lists, ranks and totals are best-effort."
                >
                  ⚠ Partial data
                </span>
              )}
              {report.finalRank ? (
                <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${rank.chip}`}>{rank.tier}</span>
              ) : null}
            </div>
            <h2 className={`${featured ? "mt-3 text-4xl sm:text-6xl" : "mt-3 text-2xl"} truncate font-black text-white`}>{report.battleName}</h2>
            <p className="mt-2 text-sm text-[var(--foreground)]/55">{formatDateRange(report)}</p>
          </div>

          <div
            className={`flex shrink-0 flex-col items-center justify-center rounded-full border-2 ${rank.medal} ${featured ? "h-32 w-32 sm:h-36 sm:w-36" : "h-20 w-20"}`}
            style={{ boxShadow: rank.glow, background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.10), rgba(0,0,0,0.35))" }}
          >
            <span className={`font-black leading-none ${featured ? "text-3xl sm:text-4xl" : "text-lg"}`}>
              {report.finalRank ? `#${report.finalRank}` : "—"}
            </span>
            <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.22em] opacity-70">{report.isActive ? "Live Rank" : "Final Rank"}</span>
          </div>
        </div>

        {/* Stat chips */}
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${featured ? "mt-6" : "mt-5"}`}>
          <StatChip label={report.isActive ? "Live Points" : "Final Points"} value={formatCompact(report.finalPoints)} sub={formatNumber(report.finalPoints)} />
          <StatChip
            label="Participants"
            value={`${formatNumber(report.participants)}/${formatNumber(report.accounts)}`}
            sub={hasData ? `${participantPct}% of accounts scored` : "No snapshot data"}
            barPct={hasData ? participantPct : 0}
          />
          <StatChip
            label="Zero Accounts"
            value={formatNumber(report.zeroAccounts)}
            tone={report.zeroAccounts > 0 ? "danger" : "normal"}
            sub={report.zeroAccounts > 0 ? "Needs review" : "Clean report"}
          />
          <StatChip label="Average" value={formatCompact(report.averagePoints)} sub={`Median ${formatCompact(report.medianPoints)}`} />
        </div>

        {/* MVPs: podium on featured, compact chips otherwise */}
        {featured ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--foreground)]/45">MVP Podium</p>
              <span className="text-xs text-[var(--foreground)]/40 transition group-hover:text-[var(--foreground)]/70">Open full report →</span>
            </div>
            {podiumDisplay.length ? (
              <div className="mx-auto grid max-w-xl grid-cols-3 items-end gap-3">
                {podiumDisplay.map((entry) => (
                  <PodiumCard key={entry.member.robloxId} member={entry.member} place={entry.place} elevated={entry.place === 0} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">MVP data appears once player snapshots are available.</p>
            )}
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            {podium.length ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                {podium.map((member, index) => (
                  <span key={`${member.robloxId}-${index}`} className="inline-flex min-w-0 items-center gap-2 text-xs">
                    <span>{PODIUM[index]?.medal}</span>
                    <img className="h-6 w-6 rounded-lg border border-white/10 bg-black/30" src={`/api/roblox/avatar?userId=${encodeURIComponent(member.robloxId)}`} alt="" />
                    <span className="truncate font-bold text-white">{member.username}</span>
                    <span className="text-[var(--foreground)]/45">{formatCompact(member.points)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">MVP data pending snapshots.</p>
            )}
            <span className="shrink-0 text-xs text-[var(--foreground)]/40 transition group-hover:text-[var(--foreground)]/70">Open →</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function OverviewStat({ icon, label, value, delay }: { icon: string; label: string; value: string; delay: number }) {
  return (
    <div className="card-hover wr-rise rounded-2xl border border-white/10 bg-white/[0.04] p-4" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]/40">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export default function WarReportsPage() {
  const [data, setData] = useState<ReportListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/war-reports", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ReportListResponse | null;
        if (alive) setData(json?.success ? json : { success: false, featured: null, reports: [], error: json?.error ?? "Failed to load reports" });
      } catch (err) {
        if (alive) setData({ success: false, featured: null, reports: [], error: err instanceof Error ? err.message : "Failed to load reports" });
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, []);

  const olderReports = useMemo(() => {
    const base = data?.featured
      ? (data.reports ?? []).filter((report) => report.battleId !== data.featured?.battleId)
      : data?.reports ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return base;
    return base.filter((report) => report.battleName.toLowerCase().includes(query) || report.battleId.toLowerCase().includes(query));
  }, [data, search]);

  const summary = useMemo(() => {
    const reports = data?.reports ?? [];
    const completed = reports.filter((report) => !report.isActive);
    const bestRank = completed.map((report) => report.finalRank).filter((rank): rank is number => typeof rank === "number" && rank > 0).sort((a, b) => a - b)[0] ?? null;
    const totalPoints = completed.reduce((sum, report) => sum + (report.finalPoints || 0), 0);
    const zeros = completed.reduce((sum, report) => sum + (report.zeroAccounts || 0), 0);
    return { reports: completed.length, bestRank, totalPoints, zeros };
  }, [data]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        {/* Header */}
        <div className="wr-rise mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">MCWV Accountability</p>
            <h1 className="mt-2 bg-gradient-to-r from-white via-white to-[var(--foreground)]/40 bg-clip-text text-4xl font-black text-transparent sm:text-6xl">
              War Reports
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--foreground)]/60">
              After-action report cards for every completed war — MVPs, grades, alt tracking, warnings, and CSV exports.
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--foreground)]/35">🔎</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[var(--primary)]/50 focus:bg-white/[0.07]"
              placeholder="Search reports..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {/* Data accuracy notice */}
        <div className="wr-rise mb-8 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-[13px] leading-5 text-amber-200/90">
          <span className="mt-0.5 shrink-0">⚠️</span>
          <p>
            <span className="font-semibold">War data before 16 Aug 2026 may be incomplete.</span>{" "}
            Full live capture began with the next battle — earlier wars were partially recovered after
            the game API started removing contributors, so member lists, ranks and totals for those wars
            are best-effort and can differ from the true final numbers.
          </p>
        </div>

        {/* Season strip */}
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStat icon="📋" label="Completed Reports" value={formatNumber(summary.reports)} delay={0.05} />
          <OverviewStat icon="🏆" label="Best Placement" value={summary.bestRank ? `#${summary.bestRank}` : "—"} delay={0.1} />
          <OverviewStat icon="⚡" label="Tracked Points" value={formatCompact(summary.totalPoints)} delay={0.15} />
          <OverviewStat icon="⛔" label="Total Zeros" value={formatNumber(summary.zeros)} delay={0.2} />
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-80 rounded-[2rem] bg-white/5" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-56 rounded-3xl bg-white/5" />
              <div className="h-56 rounded-3xl bg-white/5" />
            </div>
          </div>
        ) : data?.error ? (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-100">{data.error}</div>
        ) : !data?.reports.length ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <h2 className="text-2xl font-bold text-white">No completed war reports yet.</h2>
            <p className="mt-2 text-sm text-zinc-400">Reports will appear after completed wars have stored player snapshots.</p>
          </div>
        ) : (
          <div className="space-y-7">
            {data.featured && (
              <div className="wr-rise">
                <ReportCard report={data.featured} featured />
              </div>
            )}

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">Past Reports</h2>
                  <p className="mt-1 text-xs text-zinc-500">Open a report for grades, flags, warnings, and exports.</p>
                </div>
                <span className="text-xs text-zinc-500">{olderReports.length} shown</span>
              </div>
              {olderReports.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {olderReports.map((report, index) => (
                    <div key={report.battleId} style={{ animationDelay: `${Math.min(index * 0.05, 0.4)}s` }} className="wr-rise">
                      <ReportCard report={report} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">No reports match your search.</div>
              )}
            </section>
          </div>
        )}
      </div>

      <style jsx>{`
        .wr-rise {
          animation: wr-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes wr-rise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .wr-bar {
          animation: wr-bar 0.9s 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes wr-bar {
          from {
            width: 0;
          }
        }
        .wr-pulse {
          animation: wr-pulse 1.6s ease-in-out infinite;
        }
        @keyframes wr-pulse {
          0%,
          100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(125, 211, 252, 0.55);
          }
          50% {
            opacity: 0.6;
            box-shadow: 0 0 0 4px rgba(125, 211, 252, 0);
          }
        }
      `}</style>
    </main>
  );
}
