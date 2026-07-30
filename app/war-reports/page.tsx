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

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ReportCard({ report, featured = false }: { report: WarReportSummary; featured?: boolean }) {
  const href = `/war-reports/${encodeURIComponent(report.battleId)}`;
  const mvpText = report.topMembers.length
    ? report.topMembers.map((member) => member.username).join(", ")
    : "—";

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_35px_rgba(52,211,153,0.12)] ${featured ? "block" : ""}`}
      style={{
        borderColor: featured ? "color-mix(in srgb, var(--primary) 38%, var(--border))" : "var(--border)",
        background: featured
          ? "linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--card)), color-mix(in srgb, var(--accent) 8%, var(--card)))"
          : "var(--card)",
      }}
    >
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.12),transparent_34%)]" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/45">
              {report.isActive ? "Live Officer Preview" : featured ? "Featured War Report" : formatDate(report.endTime)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 className={`${featured ? "text-3xl sm:text-4xl" : "text-xl"} font-black text-white`}>
                {report.battleName}
              </h2>
              {report.isActive && (
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                  Current War
                </span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--foreground)]/45">Final Rank</div>
            <div className="mt-1 text-2xl font-black text-[var(--primary)]">{report.finalRank ? `#${report.finalRank}` : "—"}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Final Points" value={formatNumber(report.finalPoints)} />
          <MiniStat label="Participants" value={`${formatNumber(report.participants)}/${formatNumber(report.accounts)}`} />
          <MiniStat label="Zero Accounts" value={formatNumber(report.zeroAccounts)} tone={report.zeroAccounts > 0 ? "danger" : "normal"} />
          <MiniStat label="Average" value={formatNumber(report.averagePoints)} />
        </div>

        {featured && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--foreground)]/45">Top 3 MVPs</p>
            <p className="mt-2 text-sm font-semibold text-white">{mvpText}</p>
          </div>
        )}
      </div>
    </Link>
  );
}

function MiniStat({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground)]/45">{label}</p>
      <p className={`mt-2 text-xl font-black ${tone === "danger" ? "text-rose-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

export default function WarReportsPage() {
  const [data, setData] = useState<ReportListResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (!data?.featured) return data?.reports ?? [];
    return (data.reports ?? []).filter((report) => report.battleId !== data.featured?.battleId);
  }, [data]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">MCWV</p>
          <h1 className="mt-2 text-4xl font-black text-white sm:text-6xl">War Reports</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--foreground)]/60">
            Completed-war grades, MVPs, low performers, alt account rows, and officer report tools.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-72 rounded-3xl bg-white/5" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-48 rounded-3xl bg-white/5" />
              <div className="h-48 rounded-3xl bg-white/5" />
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
          <div className="space-y-6">
            {data.featured && <ReportCard report={data.featured} featured />}

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">Past Reports</h2>
                <span className="text-xs text-zinc-500">{data.reports.length} available</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {olderReports.map((report) => <ReportCard key={report.battleId} report={report} />)}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
