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
  averagePph: number | null;
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

function copyText(text: string) {
  if (!text) return;
  void navigator.clipboard?.writeText(text);
}

function exportCsv(data: ReportDetail) {
  const rows = [
    ["Rank", "Roblox", "Discord ID", "Points", "Share %", "Avg PPH", "Grade", "Auto Grade", "Flags", "Alt", "Owner"],
    ...data.members.map((member) => [
      member.rank,
      member.username,
      member.discordId ?? "",
      member.points,
      member.sharePct.toFixed(2),
      member.averagePph === null ? "" : Math.round(member.averagePph),
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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/45">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--foreground)]/45">{sub}</p>}
    </div>
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
      <div className="relative z-10 w-full max-w-xl rounded-3xl border border-white/10 bg-[var(--background)] p-5 shadow-2xl">
        <h2 className="text-2xl font-black text-white">Edit report note</h2>
        <p className="mt-1 text-sm text-zinc-400">{member.username}</p>
        <label className="mt-5 block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Manual Grade</span>
          <select className="admin-input" value={manualGrade} onChange={(event) => setManualGrade(event.target.value as Grade | "")}>
            <option value="">Use automatic grade ({member.autoGrade})</option>
            {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label className="mt-4 block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Officer Note</span>
          <textarea className="admin-input min-h-32" value={staffNote} onChange={(event) => setStaffNote(event.target.value)} maxLength={1200} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className="admin-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="admin-button" onClick={() => void submit()} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export default function WarReportDetailPage() {
  const params = useParams<{ battleId: string }>();
  const battleId = params.battleId;
  const [data, setData] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<ReportMember | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/war-reports/${encodeURIComponent(battleId)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ReportDetail | null;
      setData(json?.success ? json : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId]);

  const members = useMemo(() => {
    const rows = data?.members ?? [];
    if (filter === "mvp") return rows.filter((member) => member.flags.includes("MVP"));
    if (filter === "low") return rows.filter((member) => member.warning);
    if (filter === "alts") return rows.filter((member) => member.isAlt);
    if (filter === "zero") return rows.filter((member) => member.points <= 0);
    return rows;
  }, [data?.members, filter]);

  async function saveMember(robloxId: string, manualGrade: Grade | null, staffNote: string) {
    await fetch(`/api/war-reports/${encodeURIComponent(battleId)}/member`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robloxId, manualGrade, staffNote }),
    });
    await load();
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <Link className="text-sm text-zinc-400 hover:text-white" href="/war-reports">← Back to reports</Link>

        {loading ? (
          <div className="mt-6 h-96 animate-pulse rounded-3xl bg-white/5" />
        ) : !data ? (
          <div className="mt-6 rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-100">Report not found.</div>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">War Report</p>
                  <h1 className="mt-2 text-4xl font-black text-white sm:text-6xl">{data.battle.battleName}</h1>
                  <p className="mt-3 text-sm text-zinc-400">{formatDate(data.battle.startTime)} → {formatDate(data.battle.endTime)}</p>
                </div>
                {data.canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button className="admin-button" onClick={() => copyText(data.warningMessage)}>Copy warnings</button>
                    <button className="admin-button" onClick={() => exportCsv(data)}>Export CSV</button>
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <StatCard label="Final Rank" value={data.battle.finalRank ? `#${data.battle.finalRank}` : "—"} />
                <StatCard label="Final Points" value={formatNumber(data.battle.finalPoints)} />
                <StatCard label="Participants" value={`${formatNumber(data.summary.participants)}/${formatNumber(data.summary.accounts)}`} />
                <StatCard label="Average" value={formatNumber(data.summary.averagePoints)} />
                <StatCard label="Median" value={formatNumber(data.summary.medianPoints)} />
                <StatCard label="Zeros" value={formatNumber(data.summary.zeroAccounts)} />
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Grade Distribution</h2>
                <div className="mt-5 space-y-3">
                  {data.distribution.map((item) => {
                    const pct = data.members.length ? (item.count / data.members.length) * 100 : 0;
                    return (
                      <div key={item.grade} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
                        <span className={`rounded-full border px-2 py-1 text-center text-xs font-bold ${gradeClass(item.grade)}`}>{item.grade}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400" style={{ width: `${Math.max(3, pct)}%` }} />
                        </div>
                        <span className="text-right text-sm font-bold text-white">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Top 3 MVPs</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {data.summary.mvp.map((member) => (
                    <div key={member.robloxId} className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                      <img className="h-14 w-14 rounded-2xl border border-white/10 bg-black/30" src={member.avatarUrl} alt="" />
                      <p className="mt-3 truncate font-bold text-white">#{member.rank} {member.username}</p>
                      <p className="text-sm text-yellow-100">{formatNumber(member.points)} points</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Member Grades</h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["all", "All"],
                    ["mvp", "MVP"],
                    ["low", "Below Avg / D-F"],
                    ["zero", "Zero"],
                    ["alts", "Alts"],
                  ].map(([id, label]) => (
                    <button key={id} className={`rounded-full border px-3 py-1 text-xs ${filter === id ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-black/20 text-zinc-300"}`} onClick={() => setFilter(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead className="text-left text-xs uppercase tracking-[0.18em] text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Member</th>
                      <th className="px-3 py-2 text-right">Points</th>
                      <th className="px-3 py-2 text-right">Share</th>
                      <th className="px-3 py-2 text-right">Avg PPH</th>
                      <th className="px-3 py-2">Grade</th>
                      <th className="px-3 py-2">Flags</th>
                      {data.canManage && <th className="px-3 py-2 text-right">Staff</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.robloxId} className="rounded-2xl bg-black/20">
                        <td className="rounded-l-2xl px-3 py-3 font-bold text-zinc-300">#{member.rank}</td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-64 items-center gap-3">
                            <img className="h-11 w-11 rounded-2xl border border-white/10 bg-black/30" src={member.avatarUrl} alt="" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-bold text-white">{member.username}</p>
                                {member.isAlt && <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">ALT</span>}
                              </div>
                              <p className="text-xs text-zinc-500">
                                {member.isAlt && member.ownerUsername ? `Alt of ${member.ownerUsername}` : member.discordId ? `Discord linked` : "No Discord link"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-white">{formatNumber(member.points)}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{member.sharePct.toFixed(2)}%</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{member.averagePph === null ? "—" : formatNumber(Math.round(member.averagePph))}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${gradeClass(member.grade)}`}>{member.grade}</span>
                          {member.manualGrade && <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Override</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex max-w-md flex-wrap gap-1">
                            {member.flags.map((flag) => <span key={flag} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">{flag}</span>)}
                          </div>
                          {data.canManage && member.staffNote && <p className="mt-2 max-w-md text-xs text-zinc-400">Note: {member.staffNote}</p>}
                        </td>
                        {data.canManage && (
                          <td className="rounded-r-2xl px-3 py-3 text-right">
                            <button className="admin-button" onClick={() => setEditing(member)}>Edit</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
      {data?.canManage && <EditModal member={editing} onClose={() => setEditing(null)} onSave={saveMember} />}
    </main>
  );
}
