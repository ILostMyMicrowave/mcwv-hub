"use client";

import { useEffect, useState } from "react";

type HallOfFameEntry = {
id: number;
name: string;
reason: string;
image_url: string | null;
created_at: string;
created_by_username?: string | null;
};

type HallOfFameResponse = {
entries: HallOfFameEntry[];
};

function formatDate(value: string) {
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

function getInitials(name: string) {
const parts = name.trim().split(/\s+/).filter(Boolean);
if (!parts.length) return "?";
if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
return "${parts[0][0] ?? ""}${parts[1][0] ?? ""}".toUpperCase();
}

export default function HallOfFamePreview() {
const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
async function load() {
try {
const res = await fetch("/api/hall-of-fame", { cache: "no-store" });
if (!res.ok) return;

    const data: HallOfFameResponse = await res.json();
    const next = Array.isArray(data.entries) ? data.entries : [];
    setEntries(next.slice(0, 3));
  } catch {
    setEntries([]);
  } finally {
    setLoading(false);
  }
}

load();

}, []);

return (
<section
className="rounded-[2rem] border border-yellow-400/20 bg-gradient-to-b from-[#111111] to-[#070707] p-6 backdrop-blur"
style={{
background:
"linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
borderColor: "var(--border)",
}}
>
<div className="mb-5 flex items-center justify-between gap-3">
<div>
<p
className="text-xs font-semibold uppercase tracking-[0.24em]"
style={{ color: "var(--primary)" }}
>
Hall of Fame
</p>
<h2 className="mt-1 text-2xl font-black text-white">
Golden Legends
</h2>
</div>

    <a
      href="/hall-of-fame"
      className="rounded-full border px-4 py-2 text-sm font-semibold transition hover:opacity-90"
      style={{
        background: "rgba(250, 204, 21, 0.10)",
        borderColor: "rgba(250, 204, 21, 0.20)",
        color: "rgb(253, 224, 71)",
      }}
    >
      View all
    </a>
  </div>

  {loading ? (
    <p className="text-sm text-zinc-400">Loading Hall of Fame...</p>
  ) : entries.length === 0 ? (
    <p className="text-sm text-zinc-400">No Hall of Fame entries yet.</p>
  ) : (
    <div className="grid gap-4">
      {entries.map((entry, index) => (
        <article
          key={entry.id}
          className="group overflow-hidden rounded-3xl border border-yellow-400/20 bg-black/35 p-4 transition-transform duration-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/15 to-yellow-600/10 shadow-[0_0_20px_rgba(234,179,8,0.10)]">
              {entry.image_url ? (
                <img
                  src={entry.image_url}
                  alt={entry.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="text-lg font-black text-yellow-200">
                  {getInitials(entry.name)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold text-yellow-200">
                  #{String(index + 1).padStart(2, "0")}
                </span>

                <span className="text-xs uppercase tracking-[0.22em] text-yellow-300/90">
                  Hall Entry
                </span>
              </div>

              <h3 className="mt-2 truncate text-lg font-bold text-white">
                {entry.name}
              </h3>

              <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-300">
                {entry.reason}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  Added {formatDate(entry.created_at)}
                </span>

                {entry.created_by_username && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    By {entry.created_by_username}
                  </span>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )}
</section>

);
}
