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

function rankTone(rank: number | null) {
  if (!rank) return "text-zinc-300 border-white/10 bg-white/5";
  if (rank <= 10) return "text-yellow-100 border-yellow-400/30 bg-yellow-400/10";
  if (rank <= 25) return "text-emerald-100 border-emerald-400/30 bg-emerald-400/10";
  if (rank <= 50) return "text-sky-100 border-sky-400/30 bg-sky-400/10";
  return "text-rose-100 border-rose-400/30 bg-rose-400/10";
}

function ReportCard({ report, featured = false }: { report: WarReportSummary; featured?: boolean }) {
  const href = `/war-reports/${encodeURIComponent(report.battleId)}`;
  const hasData = report.accounts > 0;
  const participantPct = report.accounts > 0 ? Math.round((report.participants / report.accounts) * 100) : 0;

  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-[2rem] border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_45px_rgba(52,211,153,0.14)] ${featured ? "min-h-[22rem]" : ""}`}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--foreground)]/55">
                {report.isActive ? "Live Officer Preview" : featured ? "Featured Report" : formatDate(report.endTime)}
              </span>
              {report.isActive && (
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                  Current War
                </span>
              )}
              {!hasData && (
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">
                  Warming Up
                </span>
              )}
            </div>
            <h2 className={`${featured ? "mt-4 text-4xl sm:text-5xl" : "mt-3 text-2xl"} truncate font-black text-white`}>
              {report.battleName}
            </h2>
            <p className="mt-2 text-sm text-[var(--foreground)]/55">{formatDateRange(report)}</p>
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-right ${rankTone(report.finalRank)}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Final Rank</div>
            <div className="mt-1 text-3xl font-black">{report.finalRank ? `#${report.finalRank}` : "—"}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Final Points" value={formatCompact(report.finalPoints)} sub={formatNumber(report.finalPoints)} />
          <MiniStat label="Participants" value={`${formatNumber(report.participants)}/${formatNumber(report.accounts)}`} sub={hasData ? `${participantPct}% accounts scored` : "No snapshot data"} />
          <MiniStat label="Zero Accounts" value={formatNumber(report.zeroAccounts)} tone={report.zeroAccounts > 0 ? "danger" : "normal"} sub={report.zeroAccounts > 0 ? "Needs review" : "Clean report"} />
          <MiniStat label="Average" value={formatCompact(report.averagePoints)} sub={`Median ${formatCompact(report.medianPoints)}`} />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--foreground)]/45">Top 3 MVPs</p>
            <span className="text-xs text-[var(--foreground)]/40">Open full report →</span>
          </div>
          {report.topMembers.length ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {report.topMembers.map((member, index) => (
                <div key={`${member.robloxId}-${index}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <img className="h-8 w-8 rounded-xl border border-white/10 bg-black/30" src={`/api/roblox/avatar?userId=${encodeURIComponent(member.robloxId)}`} alt="" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">#{index + 1} {member.username}</p>
                    <p className="text-[10px] text-yellow-100">{formatCompact(member.points)} pts</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">MVP data appears once player snapshots are available.</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, sub, tone = "normal" }: { label: string; value: string; sub?: string; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground)]/45">{label}</p>
      <p className={`mt-2 text-xl font-black ${tone === "danger" ? "text-rose-200" : "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[var(--foreground)]/40">{sub}</p>}
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]/40">{label}</p>
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
        <div className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">MCWV Accountability</p>
              <h1 className="mt-2 text-4xl font-black text-white sm:text-6xl">War Reports</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]/60">
                Completed-war report cards with MVPs, automatic grades, alt rows, low performers, officer notes, warning lists, and CSV exports.
              </p>
            </div>
            <input
              className="admin-input w-full lg:w-80"
              placeholder="Search reports..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewStat label="Completed Reports" value={formatNumber(summary.reports)} />
            <OverviewStat label="Best Placement" value={summary.bestRank ? `#${summary.bestRank}` : "—"} />
            <OverviewStat label="Tracked Points" value={formatCompact(summary.totalPoints)} />
            <OverviewStat label="Total Zeros" value={formatNumber(summary.zeros)} />
          </div>
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
            {data.featured && <ReportCard report={data.featured} featured />}

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
                  {olderReports.map((report) => <ReportCard key={report.battleId} report={report} />)}
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-400">No reports match your search.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
