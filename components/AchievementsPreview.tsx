"use client";

import { useEffect, useState } from "react";

type AchievementEntry = {
  id: number;
  title: string;
  placement: string;
  war_number: number | null;
  description: string;
  date: string | null;
  created_by_username?: string | null;
  created_at: string;
};

type AchievementsResponse = {
  entries: AchievementEntry[];
};

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

function getTone(placement: string) {
  const rank = placementRank(placement);

  if (rank <= 10) {
    return {
      accent: "color-mix(in srgb, var(--primary) 42%, transparent)",
      accentSoft: "color-mix(in srgb, var(--primary) 12%, transparent)",
      text: "var(--primary)",
    };
  }

  if (rank <= 25) {
    return {
      accent: "color-mix(in srgb, var(--primary) 30%, transparent)",
      accentSoft: "color-mix(in srgb, var(--primary) 10%, transparent)",
      text: "var(--primary)",
    };
  }

  if (rank <= 50) {
    return {
      accent: "color-mix(in srgb, var(--primary) 24%, transparent)",
      accentSoft: "color-mix(in srgb, var(--primary) 8%, transparent)",
      text: "var(--primary)",
    };
  }

  return {
    accent: "color-mix(in srgb, var(--primary) 18%, transparent)",
    accentSoft: "color-mix(in srgb, var(--primary) 6%, transparent)",
    text: "var(--primary)",
  };
}

function previewText(text: string, limit = 120) {
  const plain = text
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= limit) return plain;
  return `${plain.slice(0, limit - 1).trimEnd()}…`;
}

export default function AchievementsPreview() {
  const [entries, setEntries] = useState<AchievementEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/achievements", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data: AchievementsResponse = await res.json();
        const next = Array.isArray(data.entries) ? data.entries : [];

        setEntries(next.slice(0, 2));
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
      className="rounded-[2rem] border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--card) 82%, transparent)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.24em]"
            style={{ color: "var(--primary)" }}
          >
            Achievements
          </p>
          <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
            Clan War Placements
          </h2>
        </div>

        <a
          href="/achievements"
          className="shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition hover:opacity-90 sm:px-4 sm:text-sm"
          style={{
            color: "var(--primary)",
            borderColor: "color-mix(in srgb, var(--primary) 22%, transparent)",
            background: "color-mix(in srgb, var(--primary) 10%, transparent)",
          }}
        >
          View all
        </a>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading achievements...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-400">No achievements yet.</p>
      ) : (
        <div className="grid gap-3">
          {entries.map((entry, index) => {
            const tone = getTone(entry.placement);

            return (
              <article
                key={entry.id}
                className="rounded-2xl border bg-black/25 p-3 sm:p-4"
                style={{
                  borderColor: tone.accent,
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                        style={{
                          borderColor: tone.accent,
                          background: tone.accentSoft,
                          color: tone.text,
                        }}
                      >
                        #{String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                        CW {entry.war_number ?? index + 1}
                      </span>
                    </div>

                    <h3 className="mt-2 truncate text-base font-bold text-white sm:text-lg">
                      {entry.title}
                    </h3>

                    <p className="mt-2 max-h-12 overflow-hidden text-sm leading-6 text-zinc-300">
                      {previewText(entry.description)}
                    </p>
                  </div>

                  <div
                    className="rounded-xl border px-3 py-2 sm:text-right"
                    style={{
                      borderColor: tone.accent,
                      background: tone.accentSoft,
                    }}
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                      Placement
                    </p>
                    <p className="mt-1 text-lg font-black text-white sm:text-xl">
                      {entry.placement}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
                  {entry.date && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {formatDate(entry.date)}
                    </span>
                  )}

                  {entry.created_by_username && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      By {entry.created_by_username}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
