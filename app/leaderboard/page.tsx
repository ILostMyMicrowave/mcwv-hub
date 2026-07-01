"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export const dynamic = "force-dynamic";

type LeaderboardEntry = {
  rank: number;
  user_id: number;
  name: string;
  points: number;
  avatar: string | null;
  discord_id: string | null;
};

type ApiResponse = {
  success: boolean;
  active?: boolean;
  title?: string;
  total_points?: number;
  updatedAt?: string;
  data: LeaderboardEntry[];
  error?: string;
};

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-GB").format(n);
}

function InitialAvatar({ name }: { name: string }) {
  const letter = (name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-bold text-white ring-1 ring-white/10">
      {letter}
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  className = "",
}: {
  entry?: LeaderboardEntry;
  place: 1 | 2 | 3;
  className?: string;
}) {
  const styles = {
    1: "from-yellow-500/25 to-yellow-500/5 ring-yellow-400/30",
    2: "from-zinc-300/20 to-zinc-300/5 ring-zinc-300/20",
    3: "from-orange-500/20 to-orange-500/5 ring-orange-400/20",
  }[place];

  const crowns = { 1: "🥇", 2: "🥈", 3: "🥉" }[place];

  return (
    <div
      className={`rounded-3xl border border-white/10 bg-gradient-to-b ${styles} p-5 shadow-2xl shadow-black/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-black/50 ${className}`}
    >
      {entry ? (
        <>
          <div className="mb-4 flex items-center justify-center">
            {entry.avatar ? (
              <img
                src={entry.avatar}
                alt={entry.name}
                className="h-20 w-20 rounded-full object-cover ring-4 ring-white/15"
              />
            ) : (
              <div className="h-20 w-20 rounded-full ring-4 ring-white/15">
                <InitialAvatar name={entry.name} />
              </div>
            )}
          </div>

          <div className="text-center">
            <div className="mb-1 text-2xl">{crowns}</div>
            <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
            <p className="mt-1 text-sm text-zinc-300">
              {formatNumber(entry.points)} points
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-zinc-400">
              {entry.discord_id ? "Discord linked" : "No Discord link"}
            </p>
          </div>
        </>
      ) : (
        <div className="py-10 text-center text-zinc-500">Waiting for data</div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [title, setTitle] = useState("MCWV Leaderboard");
  const [active, setActive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const prevSnapshot = useRef<string>("");

  async function load() {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      const json: ApiResponse = await res.json();

      if (!json.success) {
        setError(json.error ?? "Failed to load leaderboard");
        setData([]);
        setTotalPoints(0);
        setLoading(false);
        return;
      }

      const nextData = Array.isArray(json.data) ? json.data : [];
      const nextSnapshot = JSON.stringify(nextData);

      if (prevSnapshot.current && prevSnapshot.current !== nextSnapshot) {
        setFlash((n) => n + 1);
      }

      prevSnapshot.current = nextSnapshot;

      setData(nextData);
      setTitle(json.title ?? "MCWV Leaderboard");
      setActive(Boolean(json.active));
      setUpdatedAt(json.updatedAt ?? new Date().toISOString());
      setTotalPoints(Number(json.total_points ?? 0));
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData([]);
      setTotalPoints(0);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const podium = useMemo(() => data.slice(0, 3), [data]);
  const rest = useMemo(() => data.slice(3), [data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? "bg-emerald-400" : "bg-zinc-500"
                  } animate-pulse`}
                />
                {active ? "Live war tracking" : "No active war right now"}
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Live updates refresh every 10 seconds. Roblox avatars and Discord-link badges
                appear automatically when the API provides them.
              </p>
            </div>

            <div className="text-sm text-zinc-400">
              <div>
                Total points:{" "}
                <span className="font-semibold text-white">
                  {formatNumber(totalPoints)}
                </span>
              </div>
              <div className="mt-1">
                Last update:{" "}
                <span className="text-zinc-200">
                  {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
            Loading leaderboard...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-200">
            {error}
          </div>
        ) : (
          <>
            <section
              className={`mb-8 transition-all duration-500 ${
                flash ? "scale-[1.01]" : ""
              }`}
            >
              <div className="mb-4 text-lg font-semibold text-zinc-100">
                Top 3 podium
              </div>

              <div className="grid gap-4 md:grid-cols-3 md:items-end">
                <div className="md:order-1 md:translate-y-8">
                  <PodiumCard entry={podium[1]} place={2} />
                </div>

                <div className="md:order-2 md:-translate-y-2">
                  <PodiumCard entry={podium[0]} place={1} className="md:scale-[1.04]" />
                </div>

                <div className="md:order-3 md:translate-y-12">
                  <PodiumCard entry={podium[2]} place={3} />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Full leaderboard</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Auto refresh
                </span>
              </div>

              <div className="space-y-3">
                {rest.length === 0 && data.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center text-zinc-400">
                    No active leaderboard data yet.
                  </div>
                ) : (
                  data.map((entry) => (
                    <a
                      key={entry.user_id}
                      href={`/profile?roblox_id=${entry.user_id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-black/30"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-lg font-bold text-zinc-300">
                        #{entry.rank}
                      </div>

                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10">
                        {entry.avatar ? (
                          <img
                            src={entry.avatar}
                            alt={entry.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <InitialAvatar name={entry.name} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-white">
                            {entry.name}
                          </h3>
                          {entry.discord_id ? (
                            <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                              Discord linked
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                              Not linked
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm text-zinc-400">
                          Roblox ID: {entry.user_id}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-white">
                          {formatNumber(entry.points)}
                        </div>
                        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          points
                        </div>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
