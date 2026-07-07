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

function renderDiscordFormattedText(text: string) {
const lines = text.split(/\r?\n/);

const renderInline = (line: string) => {
const parts: React.ReactNode[] = [];
let i = 0;

while (i < line.length) {
  const rest = line.slice(i);

  const bold = rest.match(/^\*\*([^*]+)\*\*/);
  if (bold) {
    parts.push(
      <strong key={`${i}-bold`} className="font-semibold text-white">
        {bold[1]}
      </strong>
    );
    i += bold[0].length;
    continue;
  }

  const underline = rest.match(/^__([^_]+)__/);
  if (underline) {
    parts.push(
      <span
        key={`${i}-underline`}
        className="underline decoration-yellow-300/70 underline-offset-2"
      >
        {underline[1]}
      </span>
    );
    i += underline[0].length;
    continue;
  }

  const strike = rest.match(/^~~([^~]+)~~/);
  if (strike) {
    parts.push(
      <span key={`${i}-strike`} className="line-through opacity-80">
        {strike[1]}
      </span>
    );
    i += strike[0].length;
    continue;
  }

  const code = rest.match(/^`([^`]+)`/);
  if (code) {
    parts.push(
      <code
        key={`${i}-code`}
        className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-yellow-100"
      >
        {code[1]}
      </code>
    );
    i += code[0].length;
    continue;
  }

  const italic = rest.match(/^\*([^*]+)\*/);
  if (italic) {
    parts.push(
      <em key={`${i}-italic`} className="italic text-white/95">
        {italic[1]}
      </em>
    );
    i += italic[0].length;
    continue;
  }

  const plainEnd = rest.search(/(\*\*|__|~~|`|\*)/);
  if (plainEnd === -1) {
    parts.push(<span key={`${i}-plain`}>{rest}</span>);
    break;
  }

  if (plainEnd > 0) {
    parts.push(
      <span key={`${i}-plain`}>{rest.slice(0, plainEnd)}</span>
    );
    i += plainEnd;
    continue;
  }

  parts.push(<span key={`${i}-plain-ch`}>{rest[0]}</span>);
  i += 1;
}

return parts;

};

return (
<div className="space-y-1">
{lines.map((line, index) =>
line.trim().length === 0 ? (
<div key={index} className="h-2" />
) : (
<p key={index} className="leading-6 text-zinc-300">
{renderInline(line)}
</p>
)
)}
</div>
);
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
const [editId, setEditId] = useState<number | null>(null);

const canManage = role === "owner";
const isEditing = editId !== null;

const stats = useMemo(() => {
const total = entries.length;
const best =
entries.length > 0
? entries.reduce((bestEntry, entry) => {
return placementRank(entry.placement) <
placementRank(bestEntry.placement)
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
setEditId(null);
}

function startEdit(entry: AchievementEntry) {
setEditId(entry.id);
setTitle(entry.title);
setPlacement(entry.placement);
setWarNumber(entry.war_number !== null ? String(entry.war_number) : "");
setDate(entry.date ?? "");
setDescription(entry.description);
setStatus("");
document.getElementById("achievement-form")?.scrollIntoView({
behavior: "smooth",
block: "start",
});
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
    method: isEditing ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      isEditing
        ? {
            id: editId,
            title: cleanTitle,
            placement: cleanPlacement,
            war_number: warNumberValue ? Number(warNumberValue) : null,
            date: cleanDate || null,
            description: cleanDescription,
          }
        : {
            title: cleanTitle,
            placement: cleanPlacement,
            war_number: warNumberValue ? Number(warNumberValue) : null,
            date: cleanDate || null,
            description: cleanDescription,
          }
    ),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Failed to save achievement");
  }

  resetForm();
  setStatus(isEditing ? "Achievement updated" : "Achievement added");
  await refreshEntries();
} catch (err) {
  setStatus(err instanceof Error ? err.message : "Failed to save achievement");
} finally {
  setSaving(false);
  window.setTimeout(() => setStatus(""), 1800);
}

}

async function handleDelete(entry: AchievementEntry) {
if (!canManage) return;

const ok = window.confirm(`Remove ${entry.title}?`);
if (!ok) return;

setSaving(true);
setStatus("");

try {
  const res = await fetch(`/api/achievements?id=${entry.id}`, {
    method: "DELETE",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Failed to delete achievement");
  }

  if (editId === entry.id) {
    resetForm();
  }

  setStatus("Achievement removed");
  await refreshEntries();
} catch (err) {
  setStatus(err instanceof Error ? err.message : "Failed to delete achievement");
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
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Total Wars
              </p>
              <p className="mt-2 text-2xl font-bold text-white">{stats.total}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Best Placement
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {stats.best ? stats.best.placement : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Latest
              </p>
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

                    <div className="mt-4">
                      {renderDiscordFormattedText(entry.description)}
                    </div>

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

                    {canManage && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-200 transition hover:bg-yellow-400/15"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          className="rounded-full border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/15"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>

    {canManage && (
      <section
        className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10"
        id="achievement-form"
      >
        <div className="rounded-[2rem] border border-yellow-400/20 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-white">
                {isEditing ? "Edit Achievement" : "Add Achievement"}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Owner only. Add or update a clan placement.
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
                placeholder={`**MCWV** improved from __#62__ to __#38__!\n\nGreat teamwork and incredible effort.`}
              />
              <p className="mt-2 text-xs text-zinc-500">
                Discord formatting supported: bold, italics, underline, strikethrough, inline code, and line breaks.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="rounded-2xl bg-gradient-to-r from-yellow-400 to-yellow-600 px-5 py-3 font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : isEditing
                    ? "Update Achievement"
                    : "Save Achievement"}
              </button>

              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    )}
  </main>
</>

);
              }
