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
      border: "border-yellow-300/30",
      badge: "bg-yellow-400/10 text-yellow-200 border-yellow-400/20",
      glow: "shadow-[0_0_24px_rgba(250,204,21,0.16)]",
    };
  }

  if (rank <= 25) {
    return {
      border: "border-zinc-200/20",
      badge: "bg-zinc-200/10 text-zinc-200 border-zinc-200/20",
      glow: "shadow-[0_0_24px_rgba(255,255,255,0.10)]",
    };
  }

  if (rank <= 50) {
    return {
      border: "border-amber-700/25",
      badge: "bg-amber-500/10 text-amber-200 border-amber-500/20",
      glow: "shadow-[0_0_24px_rgba(180,83,9,0.14)]",
    };
  }

  return {
    border: "border-emerald-400/20",
    badge: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20",
    glow: "shadow-[0_0_24px_rgba(52,211,153,0.12)]",
  };
}

function renderDiscordFormattedText(text: string) {
  const lines = text.split(/\r?\n/);

  return (
    <div className="space-y-1">
      {lines.map((line, lineIndex) => {
        if (!line.trim()) {
          return <div key={lineIndex} className="h-2" />;
        }

        const nodes: React.ReactNode[] = [];
        const regex = /(\*\*.+?\*\*|__.+?__|\*.+?\*)/g;

        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let key = 0;

        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            nodes.push(line.slice(lastIndex, match.index));
          }

          const token = match[0];

          if (token.startsWith("**") && token.endsWith("**")) {
            nodes.push(
              <strong
                key={`b-${lineIndex}-${key++}`}
                className="font-semibold text-white"
              >
                {token.slice(2, -2)}
              </strong>
            );
          } else if (token.startsWith("__") && token.endsWith("__")) {
            nodes.push(
              <u
                key={`u-${lineIndex}-${key++}`}
                className="underline-offset-2"
              >
                {token.slice(2, -2)}
              </u>
            );
          } else if (token.startsWith("*") && token.endsWith("*")) {
            nodes.push(
              <em
                key={`i-${lineIndex}-${key++}`}
                className="italic text-white/95"
              >
                {token.slice(1, -1)}
              </em>
            );
          }

          lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
          nodes.push(line.slice(lastIndex));
        }

        return (
          <p key={lineIndex} className="leading-6 text-zinc-300">
            {nodes}
          </p>
        );
      })}
    </div>
  );
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
      className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#121212] to-[#070707] p-6 backdrop-blur"
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
            Achievements
          </p>

          <h2 className="mt-1 text-2xl font-black text-white">
            Clan War Placements
          </h2>
        </div>

        <a
          href="/achievements"
          className="rounded-full border px-4 py-2 text-sm font-semibold transition hover:opacity-90"
          style={{
            background: "rgba(52, 211, 153, 0.10)",
            borderColor: "rgba(52, 211, 153, 0.20)",
            color: "var(--primary)",
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
        <div className="grid gap-4">
          {entries.map((entry, index) => {
            const tone = getTone(entry.placement);

            return (
              <article
                key={entry.id}
                className={`overflow-hidden rounded-3xl border bg-black/35 p-4 ${tone.border} ${tone.glow}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}
                      >
                        #{String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                        Clan War {entry.war_number ?? index + 1}
                      </span>
                    </div>

                    <h3 className="mt-2 text-lg font-bold text-white">
                      {entry.title}
                    </h3>
                  </div>

                  <div
                    className="rounded-2xl border px-3 py-2 text-right"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--primary) 22%, transparent)",
                      background:
                        "color-mix(in srgb, var(--primary) 9%, transparent)",
                    }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                      Placement
                    </p>

                    <p className="mt-1 text-xl font-black text-white">
                      {entry.placement}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  {renderDiscordFormattedText(entry.description)}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-300">
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
