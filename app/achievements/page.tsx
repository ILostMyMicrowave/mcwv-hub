"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useMemo, useState } from "react";

type AchievementEntry = {
id: number;
title: string;
placement: string;
war_number: number | null;
description: string;
date: string | null;
created_by?: number | null;
created_by_username?: string | null;
created_at: string;
};

type AchievementsResponse = {
entries: AchievementEntry[];
};

type AppUser = {
id: number;
username: string;
role: "member" | "officer" | "owner";
};

type AuthMeResponse =
| { user?: AppUser | null; role?: AppUser["role"] | null }
| AppUser
| null;

function formatDate(value: string | null) {
if (!value) return "";
try {
return new Date(value).toLocaleDateString("en-GB", {
year: "numeric",
month: "short",
day: "numeric",
});
} catch {
return value;
}
}

function placementRank(placement: string) {
const match = placement.match(/(\d+)/);
return match ? Number(match[1]) : 9999;
}

function getCardTone(placement: string) {
const rank = placementRank(placement);

if (rank <= 10) {
return {
border: "border-yellow-300/30",
glow: "shadow-[0_0_28px_rgba(250,204,21,0.18)]",
badge: "bg-yellow-400/10 text-yellow-200 border-yellow-400/20",
accent: "from-yellow-300 to-yellow-500",
};
}

if (rank <= 25) {
return {
border: "border-zinc-200/20",
glow: "shadow-[0_0_24px_rgba(255,255,255,0.10)]",
badge: "bg-zinc-200/10 text-zinc-200 border-zinc-200/20",
accent: "from-zinc-200 to-zinc-400",
};
}

if (rank <= 50) {
return {
border: "border-amber-700/25",
glow: "shadow-[0_0_24px_rgba(180,83,9,0.18)]",
badge: "bg-amber-500/10 text-amber-200 border-amber-500/20",
accent: "from-amber-300 to-amber-600",
};
}

return {
border: "border-emerald-400/20",
glow: "shadow-[0_0_24px_rgba(52,211,153,0.14)]",
badge: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20",
accent: "from-emerald-300 to-emerald-500",
};
}

export default function AchievementsPage() {
const [entries, setEntries] = useState<AchievementEntry[]>([]);
const [loading, setLoading] = useState(true);
const [role, setRole] = useState<AppUser["role"] | null>(null);

const [title, setTitle] = useState("");
const [placement, setPlacement] = useState("");
const [warNumber, setWarNumber] = useState("");
const [date, setDate] = useState("");
const [description, setDescription] = useState("");
const [saving, setSaving] = useState(false);
const [status, setStatus] = useState("");

const canManage = role === "owner";

const stats = useMemo(() => {
const total = entries.length;
const best =
entries.length > 0
? entries.reduce((bestEntry, entry) => {
return placementRank(entry.placement) < placementRank(bestEntry.placement)
? entry
: bestEntry;
})
: null;

const latest = entries[0] ?? null;

return {
  total,
  best,
  latest,
};

}, [entries]);

useEffect(() => {
async function load() {
setLoading(true);

  try {
    const [achievementsRes, authRes] = await Promise.all([
      fetch("/api/achievements", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ]);

    if (achievementsRes.ok) {
      const data: AchievementsResponse = await achievementsRes.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } else {
      setEntries([]);
    }

    if (authRes.ok) {
      const authData: AuthMeResponse = await authRes.json();

      const resolvedUser =
        authData && "user" in authData
          ? authData.user ?? null
          : authData && "role" in authData
          ? (authData as AppUser)
          : (authData as AppUser | null);

      setRole(resolvedUser?.role ?? "member");
    } else {
      setRole("member");
    }
  } catch {
    setEntries([]);
    setRole("member");
  } finally {
    setLoading(false);
  }
}

load();

}, []);

async function refreshEntries() {
const refreshed = await fetch("/api/achievements", { cache: "no-store" });
if (refreshed.ok) {
const data: AchievementsResponse = await refreshed.json();
setEntries(Array.isArray(data.entries) ? data.entries : []);
}
}

function resetForm() {
setTitle("");
setPlacement("");
setWarNumber("");
setDate("");
setDescription("");
setStatus("");
}

async function handleAdd() {
if (!canManage) {
setStatus("Owner only");
return;
}

const cleanTitle = title.trim();
const cleanPlacement = placement.trim();
const cleanDescription = description.trim();
const cleanDate = date.trim();
const warNumberValue = warNumber.trim();

if (!cleanTitle || !cleanPlacement || !cleanDescription) {
  setStatus("Title, placement, and description are required");
  return;
}

setSaving(true);
setStatus("");

try {
  const res = await fetch("/api/achievements", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: cleanTitle,
      placement: cleanPlacement,
      war_number: warNumberValue ? Number(warNumberValue) : null,
      date: cleanDate || null,
      description: cleanDescription,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Failed to add achievement");
  }

  resetForm();
  setStatus("Achievement added");
  await refreshEntries();
} catch (err) {
  setStatus(err instanceof Error ? err.message : "Failed to add achievement");
} finally {
  setSaving(false);
  window.setTimeout(() => setStatus(""), 1800);
}

}

return (
<>
<Navbar />

  <main className="min-h-screen bg-black text-white">
    <section className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 lg:px-10">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#121212] to-[#070707] p-6 shadow-[0_0_40px_rgba(234,179,8,0.06)] sm:p-10">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top,rgba(250,204,21,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.10),transparent_30%)]" />
        <div className="relative">
          <div className="inline-flex items-center rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-semibold tracking-[0.24em] text-yellow-300">
            ACHIEVEMENTS
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
            Clan War Placements
          </h1>

          <p className="mt-4 max-w-2xl text-sm text-zinc-300 sm:text-base">
            A record of MCWV&apos;s strongest Clan War finishes, framed like trophies and
            kept in order for the clan&apos;s history.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Total Wars</p>
              <p className="mt-2 text-2xl font-bold text-white">{stats.total}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Best Placement</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {stats.best ? stats.best.placement : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Latest</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {stats.latest ? stats.latest.placement : "—"}
              </p>
            </div>
          </div>

          <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" />
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-400">
          Loading achievements...
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-300">
          No achievements yet.
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((entry, index) => {
              const tone = getCardTone(entry.placement);
              const rank = placementRank(entry.placement);

              return (
                <article
                  key={entry.id}
                  className={`
                    group relative overflow-hidden rounded-[2rem] border bg-[#0d0d0d] p-5
                    transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(234,179,8,0.22)]
                    ${tone.border} ${tone.glow}
                  `}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(circle_at_top,rgba(250,204,21,0.12),transparent_40%)]" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-yellow-300">
                          Clan War {entry.war_number ?? index + 1}
                        </p>
                        <h3 className="mt-1 text-2xl font-black text-white">
                          {entry.title}
                        </h3>
                      </div>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.badge}`}
                      >
                        {entry.placement}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-yellow-300">
                        Placement
                      </p>
                      <p
                        className={`mt-2 bg-gradient-to-r ${tone.accent} bg-clip-text text-4xl font-black text-transparent`}
                      >
                        {entry.placement}
                      </p>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-zinc-300">
                      {entry.description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs">
                      {entry.date && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                          {formatDate(entry.date)}
                        </span>
                      )}
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                        Rank #{rank}
                      </span>
                      {entry.created_by_username && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                          By {entry.created_by_username}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>

    {canManage && (
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
        <div className="rounded-[2rem] border border-yellow-400/20 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-white">
                Add Achievement
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Owner only. Add or record a clan placement.
              </p>
            </div>
            <p className="text-xs text-zinc-500">{status}</p>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                  placeholder="MCWV Clan War #2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Placement
                </label>
                <input
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                  placeholder="Top #38"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  War Number
                </label>
                <input
                  type="number"
                  min={1}
                  value={warNumber}
                  onChange={(e) => setWarNumber(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                  placeholder="2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-200">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                placeholder="MCWV improved from #62 to #38..."
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="rounded-2xl bg-gradient-to-r from-yellow-400 to-yellow-600 px-5 py-3 font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Achievement"}
              </button>
            </div>
          </div>
        </div>
      </section>
    )}
  </main>
</>

);
}
