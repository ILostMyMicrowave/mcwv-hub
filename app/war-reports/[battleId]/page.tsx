"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";
const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;

type Grade = typeof GRADES[number];

type ReportMember = {
  rank: number;
  robloxId: string;
  username: string;
  avatarUrl: string;
  discordId: string | null;
  isAlt: boolean;
  ownerUsername: string | null;
  ownerRobloxId: string | null;
  points: number;
  sharePct: number;
  autoGrade: Grade;
  manualGrade: Grade | null;
  grade: Grade;
  flags: string[];
  warning: boolean;
  staffNote?: string;
  noteUpdatedAt?: string | null;
  noteUpdatedBy?: string | null;
};

type ReportDetail = {
  success: boolean;
  canManage: boolean;
  battle: {
    battleId: string;
    battleName: string;
    startTime: string | null;
    endTime: string | null;
    finalRank: number | null;
    finalPoints: number;
    capturedAt: string | null;
    isActive?: boolean;
  };
  summary: {
    accounts: number;
    participants: number;
    zeroAccounts: number;
    averagePoints: number;
    medianPoints: number;
    totalMemberPoints: number;
    mvp: ReportMember[];
  };
  distribution: Array<{ grade: Grade; count: number }>;
  members: ReportMember[];
  warningMessage: string;
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
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function gradeClass(grade: string) {
  switch (grade) {
    case "A+": return "border-yellow-400/40 bg-yellow-400/15 text-yellow-100";
    case "A": return "border-emerald-400/35 bg-emerald-400/12 text-emerald-100";
    case "B": return "border-sky-400/35 bg-sky-400/12 text-sky-100";
    case "C": return "border-amber-400/35 bg-amber-400/12 text-amber-100";
    case "D": return "border-orange-400/35 bg-orange-400/12 text-orange-100";
    default: return "border-rose-400/35 bg-rose-400/12 text-rose-100";
  }
}

function gradeBar(grade: string) {
  switch (grade) {
    case "A+": return "from-yellow-300 to-amber-400";
    case "A": return "from-emerald-300 to-emerald-500";
    case "B": return "from-sky-300 to-sky-500";
    case "C": return "from-amber-300 to-orange-400";
    case "D": return "from-orange-400 to-rose-400";
    default: return "from-rose-400 to-red-500";
  }
}

function rankGlow(rank: number | null) {
  if (!rank) return "0 0 0 rgba(0,0,0,0)";
  if (rank <= 10) return "0 0 45px rgba(250,204,21,0.28)";
  if (rank <= 25) return "0 0 40px rgba(52,211,153,0.24)";
  if (rank <= 50) return "0 0 40px rgba(56,189,248,0.22)";
  return "0 0 36px rgba(167,139,250,0.20)";
}

function flagMeta(flag: string) {
  const key = flag.toLowerCase();
  if (key.includes("mvp")) return { icon: "🏆", label: "MVP", className: "border-yellow-400/40 bg-yellow-400/15 text-yellow-100" };
  if (key.includes("top 10")) return { icon: "🔥", label: "Top 10", className: "border-emerald-400/35 bg-emerald-400/12 text-emerald-100" };
  if (key.includes("top 25")) return { icon: "⬆", label: "Top 25", className: "border-lime-400/30 bg-lime-400/10 text-lime-100" };
  if (key.includes("above")) return { icon: "✅", label: "Above avg", className: "border-sky-400/35 bg-sky-400/12 text-sky-100" };
  if (key.includes("below")) return { icon: "⚠", label: "Below avg", className: "border-amber-400/35 bg-amber-400/12 text-amber-100" };
  if (key.includes("low")) return { icon: "📉", label: "Low", className: "border-orange-400/35 bg-orange-400/12 text-orange-100" };
  if (key.includes("review")) return { icon: "👀", label: "Review", className: "border-amber-400/35 bg-amber-400/12 text-amber-100" };
  if (key.includes("zero")) return { icon: "⛔", label: "Zero", className: "border-rose-400/35 bg-rose-400/12 text-rose-100" };
  if (key.includes("unlinked")) return { icon: "🔗", label: "Unlinked", className: "border-rose-400/35 bg-rose-400/12 text-rose-100" };
  if (key.includes("discord")) return { icon: "💬", label: "No Discord", className: "border-rose-400/35 bg-rose-400/12 text-rose-100" };
  if (key.includes("alt")) return { icon: "🔁", label: "Alt", className: "border-violet-400/35 bg-violet-400/12 text-violet-100" };
  if (key.includes("live")) return { icon: "●", label: "Live", className: "border-cyan-400/35 bg-cyan-400/12 text-cyan-100" };
  if (key.includes("left")) return { icon: "👋", label: "Left clan", className: "border-zinc-400/35 bg-zinc-400/10 text-zinc-200" };
  return { icon: "•", label: flag, className: "border-white/10 bg-white/5 text-zinc-300" };
}

function copyText(text: string) {
  if (!text) return;
  void navigator.clipboard?.writeText(text);
}

const buttonClass =
  "rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45";
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:bg-black/40";

function exportCsv(data: ReportDetail) {
  const rows = [
    ["Rank", "Roblox", "Discord ID", "Points", "Share %", "Grade", "Auto Grade", "Flags", "Alt", "Owner"],
    ...data.members.map((member) => [
      member.rank,
      member.username,
      member.discordId ?? "",
      member.points,
      member.sharePct.toFixed(2),
      member.grade,
      member.autoGrade,
      member.flags.join("; "),
      member.isAlt ? "yes" : "no",
      member.ownerUsername ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.battle.battleId}-war-report.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, sub, barPct }: { label: string; value: string; sub?: string; barPct?: number }) {
  return (
    <div className="card-hover rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/45">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {typeof barPct === "number" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="wrd-bar h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
            style={{ width: `${Math.max(barPct > 0 ? 4 : 0, Math.min(100, barPct))}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-1.5 text-xs text-[var(--foreground)]/45">{sub}</p>}
    </div>
  );
}

function FlagChips({ member, canManage }: { member: ReportMember; canManage: boolean }) {
  return (
    <>
      <div className="flex max-w-md flex-wrap gap-1">
        {member.flags.map((flag) => {
          const meta = flagMeta(flag);
          return (
            <span key={flag} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </span>
          );
        })}
      </div>
      {canManage && member.staffNote && <p className="mt-2 max-w-md text-xs text-zinc-400">Note: {member.staffNote}</p>}
    </>
  );
}

function EditModal({
  member,
  onClose,
  onSave,
}: {
  member: ReportMember | null;
  onClose: () => void;
  onSave: (robloxId: string, manualGrade: Grade | null, staffNote: string) => Promise<void>;
}) {
  const [manualGrade, setManualGrade] = useState<Grade | "">("");
  const [staffNote, setStaffNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setManualGrade(member?.manualGrade ?? "");
    setStaffNote(member?.staffNote ?? "");
  }, [member]);

  if (!member) return null;

  async function submit() {
    setSaving(true);
    try {
      await onSave(member!.robloxId, manualGrade ? manualGrade : null, staffNote);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="wrd-rise relative z-10 w-full max-w-xl rounded-3xl border border-white/10 bg-[var(--background)] p-5 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-3">
          <img className="h-11 w-11 rounded-2xl border border-white/10 bg-black/30" src={member.avatarUrl} alt="" />
          <div>
            <h2 className="text-xl font-black text-white">Edit report note</h2>
            <p className="text-sm text-zinc-400">{member.username}</p>
          </div>
        </div>
        <label className="mt-5 block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Manual Grade</span>
          <select className={inputClass} value={manualGrade} onChange={(event) => setManualGrade(event.target.value as Grade | "")}>
            <option value="">Use automatic grade ({member.autoGrade})</option>
            {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label className="mt-4 block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Officer Note</span>
          <textarea className={`${inputClass} min-h-32`} value={staffNote} onChange={(event) => setStaffNote(event.target.value)} maxLength={1200} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className={buttonClass} onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 px-5 py-2 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTERS: Array<{ id: string; label: string; test: (m: ReportMember) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  { id: "mvp", label: "MVP", test: (m) => m.flags.includes("MVP") },
  { id: "low", label: "Below Avg / D-F", test: (m) => m.warning },
  { id: "zero", label: "Zero", test: (m) => m.points <= 0 },
  { id: "alts", label: "Alts", test: (m) => m.isAlt },
  { id: "left", label: "Left clan", test: (m) => m.flags.includes("Left Clan") },
];

export default function WarReportDetailPage() {
  const params = useParams<{ battleId: string }>();
  const battleId = params.battleId;
  const [data, setData] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<ReportMember | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/war-reports/${encodeURIComponent(battleId)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as (ReportDetail & { error?: string }) | null;
      if (json?.success) {
        setData(json);
      } else {
        setData(null);
        setError(json?.error ?? `Report request failed (${res.status})`);
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId]);

  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];

  const members = useMemo(() => {
    const rows = data?.members ?? [];
    return rows.filter(activeFilter.test);
  }, [data?.members, activeFilter]);

  async function saveMember(robloxId: string, manualGrade: Grade | null, staffNote: string) {
    await fetch(`/api/war-reports/${encodeURIComponent(battleId)}/member`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robloxId, manualGrade, staffNote }),
    });
    await load();
  }

  const participationPct =
    data && data.summary.accounts > 0 ? Math.round((data.summary.participants / data.summary.accounts) * 100) : 0;

  // Podium display order on desktop: 2nd, 1st (elevated centre), 3rd. Mobile keeps natural order.
  const podium = data?.summary.mvp.slice(0, 3) ?? [];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <Link className="text-sm text-zinc-400 transition hover:text-white" href="/war-reports">← Back to reports</Link>

        {loading ? (
          <div className="mt-6 h-96 animate-pulse rounded-3xl bg-white/5" />
        ) : !data ? (
          <div className="mt-6 rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-100">
            {error || "Report not found."}
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Hero band */}
            <section className="wrd-rise relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.09),transparent_38%)]" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">
                      {data.battle.isActive ? "Live Preview" : "War Report"}
                    </p>
                    {data.battle.isActive && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                        <span className="wrd-pulse inline-block h-1.5 w-1.5 rounded-full bg-sky-300" />
                        Current War
                      </span>
                    )}
                    {!data.battle.isActive &&
                      (() => {
                        const end = data.battle.endTime ? new Date(data.battle.endTime).getTime() : NaN;
                        const partial = !Number.isFinite(end) || end < Date.parse("2026-08-16T00:00:00Z");
                        return partial ? (
                          <span
                            className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100"
                            title="Captured after the game API began removing contributors — member lists, ranks and totals are best-effort."
                          >
                            ⚠ Partial data
                          </span>
                        ) : null;
                      })()}
                  </div>
                  <h1 className="mt-2 bg-gradient-to-r from-white via-white to-[var(--foreground)]/40 bg-clip-text text-4xl font-black text-transparent sm:text-6xl">
                    {data.battle.battleName}
                  </h1>
                  <p className="mt-3 text-sm text-zinc-400">{formatDate(data.battle.startTime)} → {formatDate(data.battle.endTime)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <div
                    className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-[var(--primary)]/50 text-white sm:h-32 sm:w-32"
                    style={{ boxShadow: rankGlow(data.battle.finalRank), background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.10), rgba(0,0,0,0.35))" }}
                  >
                    <span className="text-3xl font-black leading-none sm:text-4xl">{data.battle.finalRank ? `#${data.battle.finalRank}` : "—"}</span>
                    <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.22em] opacity-70">
                      {data.battle.isActive ? "Live Rank" : "Final Rank"}
                    </span>
                  </div>
                  {data.canManage && (
                    <div className="flex flex-col gap-2">
                      <button className={buttonClass} disabled={!data.warningMessage} onClick={() => copyText(data.warningMessage)}>Copy warnings</button>
                      <button className={buttonClass} onClick={() => exportCsv(data)}>Export CSV</button>
                    </div>
                  )}
                </div>
              </div>

              {data.battle.isActive && (
                <div className="relative mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                  This is a live preview. Points, ranks, grades, MVPs, and warning lists can change until the war ends.
                </div>
              )}

              <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard label={data.battle.isActive ? "Current Points" : "Final Points"} value={formatNumber(data.battle.finalPoints)} />
                <StatCard
                  label="Scored / In Clan"
                  value={`${formatNumber(data.summary.participants)}/${formatNumber(data.summary.accounts)}`}
                  sub={data.summary.accounts > 0 ? `${participationPct}% participation` : "No snapshot data"}
                  barPct={participationPct}
                />
                <StatCard label="Average / Account" value={formatNumber(data.summary.averagePoints)} sub={`Median ${formatNumber(data.summary.medianPoints)}`} />
                <StatCard label="Zero Points" value={formatNumber(data.summary.zeroAccounts)} sub={data.summary.zeroAccounts > 0 ? "Needs review" : "Clean report"} />
                <StatCard label="Member Points" value={formatNumber(data.summary.totalMemberPoints)} sub="Sum of member scores" />
              </div>
            </section>

            {/* Distribution + MVP podium */}
            <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="wrd-rise rounded-3xl border border-white/10 bg-white/[0.04] p-5" style={{ animationDelay: "0.08s" }}>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Grade Distribution</h2>
                <div className="mt-5 space-y-3">
                  {data.distribution.map((item, index) => {
                    const pct = data.members.length ? (item.count / data.members.length) * 100 : 0;
                    return (
                      <div key={item.grade} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
                        <span className={`rounded-full border px-2 py-1 text-center text-xs font-bold ${gradeClass(item.grade)}`}>{item.grade}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`wrd-bar h-full rounded-full bg-gradient-to-r ${gradeBar(item.grade)}`}
                            style={{ width: `${Math.max(item.count > 0 ? 3 : 0, pct)}%`, animationDelay: `${0.2 + index * 0.07}s` }}
                          />
                        </div>
                        <span className="text-right text-sm font-bold text-white">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="wrd-rise rounded-3xl border border-white/10 bg-white/[0.04] p-5" style={{ animationDelay: "0.14s" }}>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">MVP Podium</h2>
                {podium.length ? (
                  <div className="mx-auto mt-4 grid max-w-xl grid-cols-3 items-end gap-3">
                    {[1, 0, 2].map((orderIdx) => {
                      const member = podium[orderIdx];
                      if (!member) return null;
                      const place = orderIdx;
                      const elevated = place === 0;
                      const medal = ["🥇", "🥈", "🥉"][place];
                      const ring = elevated ? "border-yellow-300/60" : place === 1 ? "border-zinc-300/50" : "border-amber-500/55";
                      const halo = elevated ? "0 0 34px rgba(250,204,21,0.30)" : "0 0 22px rgba(255,255,255,0.14)";
                      return (
                        <div
                          key={member.robloxId}
                          className={`shine-sweep glow-spin flex flex-col items-center rounded-2xl border p-4 text-center transition duration-300 hover:-translate-y-1 ${
                            elevated ? "border-yellow-400/25 bg-yellow-400/10 sm:-translate-y-3 sm:scale-[1.06]" : "border-white/10 bg-black/20"
                          }`}
                        >
                          <span className="text-lg leading-none">{medal}</span>
                          <img
                            className={`mt-2 rounded-2xl border-2 bg-black/30 ${ring} ${elevated ? "h-16 w-16" : "h-12 w-12"}`}
                            style={{ boxShadow: halo }}
                            src={member.avatarUrl}
                            alt=""
                          />
                          <p className="mt-2 w-full truncate text-xs font-bold text-white">#{member.rank} {member.username}</p>
                          <p className={`text-[11px] font-bold ${elevated ? "text-yellow-100" : "text-zinc-300"}`}>{formatNumber(member.points)} pts</p>
                          <p className="text-[10px] text-zinc-500">{member.sharePct.toFixed(1)}% share</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500">MVP data appears once player snapshots are available.</p>
                )}
              </div>
            </section>

            {/* Member grades */}
            <section className="wrd-rise rounded-3xl border border-white/10 bg-white/[0.04] p-5" style={{ animationDelay: "0.2s" }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
                  Member Grades <span className="ml-1 text-zinc-500">({members.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => {
                    const count = (data?.members ?? []).filter(f.test).length;
                    return (
                      <button
                        key={f.id}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          filter === f.id
                            ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
                            : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/20"
                        }`}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.label} <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile: stacked cards */}
              <div className="mt-5 space-y-3 md:hidden">
                {members.map((member) => (
                  <div
                    key={member.robloxId}
                    className={`rounded-2xl border p-4 ${member.flags.includes("Left Clan") ? "border-zinc-500/20 bg-zinc-500/5 opacity-70" : "border-white/10 bg-black/20"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <img className="h-11 w-11 rounded-2xl border border-white/10 bg-black/30" src={member.avatarUrl} alt="" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-bold text-white">{member.username}</p>
                            {member.isAlt && (
                              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">ALT</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            #{member.rank} · {member.isAlt && member.ownerUsername ? `Alt of ${member.ownerUsername}` : member.discordId ? "Discord linked" : "No Discord link"}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${gradeClass(member.grade)}`}>{member.grade}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                      <div>
                        <p className="text-sm font-black text-white">{formatNumber(member.points)}</p>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{member.sharePct.toFixed(2)}% share{member.manualGrade ? " · override" : ""}</p>
                      </div>
                      {data.canManage && (
                        <button className={buttonClass} onClick={() => setEditing(member)}>Edit</button>
                      )}
                    </div>
                    <div className="mt-3">
                      <FlagChips member={member} canManage={data.canManage} />
                    </div>
                  </div>
                ))}
                {!members.length && <p className="py-6 text-center text-sm text-zinc-500">No members match this filter.</p>}
              </div>

              {/* Desktop: table */}
              <div className="mt-5 hidden overflow-x-auto md:block">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead className="text-left text-xs uppercase tracking-[0.18em] text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Member</th>
                      <th className="px-3 py-2 text-right">Points</th>
                      <th className="px-3 py-2 text-right">Share</th>
                      <th className="px-3 py-2">Grade</th>
                      <th className="px-3 py-2">Flags</th>
                      {data.canManage && <th className="px-3 py-2 text-right">Staff</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.robloxId}
                        className={`rounded-2xl transition hover:bg-black/30 ${member.flags.includes("Left Clan") ? "bg-zinc-500/10 opacity-70" : "bg-black/20"}`}
                      >
                        <td className="rounded-l-2xl px-3 py-3 font-bold text-zinc-300">#{member.rank}</td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-64 items-center gap-3">
                            <img className="h-11 w-11 rounded-2xl border border-white/10 bg-black/30" src={member.avatarUrl} alt="" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-bold text-white">{member.username}</p>
                                {member.isAlt && (
                                  <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">ALT</span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500">
                                {member.isAlt && member.ownerUsername ? `Alt of ${member.ownerUsername}` : member.discordId ? "Discord linked" : "No Discord link"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-white">{formatNumber(member.points)}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{member.sharePct.toFixed(2)}%</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${gradeClass(member.grade)}`}>{member.grade}</span>
                          {member.manualGrade && <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Override</span>}
                        </td>
                        <td className="px-3 py-3">
                          <FlagChips member={member} canManage={data.canManage} />
                        </td>
                        {data.canManage && (
                          <td className="rounded-r-2xl px-3 py-3 text-right">
                            <button className={buttonClass} onClick={() => setEditing(member)}>Edit</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!members.length && <p className="py-6 text-center text-sm text-zinc-500">No members match this filter.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
      {data?.canManage && <EditModal member={editing} onClose={() => setEditing(null)} onSave={saveMember} />}

      <style jsx>{`
        .wrd-rise {
          animation: wrd-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes wrd-rise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .wrd-bar {
          animation: wrd-bar 0.9s 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes wrd-bar {
          from {
            width: 0;
          }
        }
        .wrd-pulse {
          animation: wrd-pulse 1.6s ease-in-out infinite;
        }
        @keyframes wrd-pulse {
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
