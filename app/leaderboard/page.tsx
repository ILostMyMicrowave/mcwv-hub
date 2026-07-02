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
      className={`relative rounded-3xl border border-white/10 bg-gradient-to-b ${styles} p-5 shadow-2xl shadow-black/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-black/50 ${className}`}
    >
      {entry ? (
        <>
          <div className="mb-4 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              {entry.avatar ? (
                <img
                  src={entry.avatar}
                  alt={entry.name}
                  className={`h-20 w-20 rounded-full object-cover ring-4 ${
                    place === 1 ? "ring-yellow-300/30" : "ring-white/15"
                  }`}
                />
              ) : (
                <div
                  className={`h-20 w-20 rounded-full ring-4 ${
                    place === 1 ? "ring-yellow-300/30" : "ring-white/15"
                  }`}
                >
                  <InitialAvatar name={entry.name} />
                </div>
              )}
            </div>
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
  const [rankChange, setRankChange] = useState<Record<number, number>>({});
  const [now, setNow] = useState(Date.now());

  const prevSnapshot = useRef<string>("");
  const prevRanksRef = useRef<Record<number, number>>({});

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

      const nextRanks: Record<number, number> = {};
      const changes: Record<number, number> = {};

      nextData.forEach((entry) => {
        const oldRank = prevRanksRef.current[entry.user_id];
        const newRank = entry.rank;

        if (oldRank !== undefined) {
          changes[entry.user_id] = oldRank - newRank;
        }

        nextRanks[entry.user_id] = newRank;
      });

      prevRanksRef.current = nextRanks;
      setRankChange(changes);

      setData(nextData);
      setTitle(json.title ?? "MCWV Leaderboard");
      setActive(Boolean(json.active));
      setUpdatedAt(new Date().toISOString());
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
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
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
                Live updates refresh every 10 seconds.
              </p>
            </div>

            <div className="text-sm text-zinc-400">
              <div>
                Total points:{" "}
                <span className="font-semibold text-white">
                  {formatNumber(totalPoints)}
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
            {/* PODIUM (UNCHANGED) */}
            <section className={`mb-8 transition-all duration-500 ${flash ? "scale-[1.01]" : ""}`}>
              <div className="mb-4 text-lg font-semibold text-zinc-100">
                Top 3 podium
              </div>

              <div className="grid gap-4 md:grid-cols-3 md:items-end">
                <div className="md:order-1 md:translate-y-8">
                  <PodiumCard entry={podium[1]} place={2} />
                </div>

                <div className="md:order-2 md:-translate-y-2">
                  <PodiumCard entry={podium[0]} place={1} />
                </div>

                <div className="md:order-3 md:translate-y-12">
                  <PodiumCard entry={podium[2]} place={3} />
                </div>
              </div>
            </section>

            {/* LIST */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
              <h2 className="mb-4 text-xl font-semibold">Full leaderboard</h2>

              <div className="space-y-3">
                {data.map((entry) => {
                  const change = rankChange[entry.user_id] ?? 0;

                  return (
                    <a
                      key={entry.user_id}
                      href={`/profile?roblox_id=${entry.user_id}`}
                      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-lg font-bold">#{entry.rank}</div>

                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full">
                        {entry.avatar ? (
                          <img src={entry.avatar} className="h-full w-full object-cover" />
                        ) : (
                          <InitialAvatar name={entry.name} />
                        )}
                      </div>

                      <div className="flex-1">
                        <p className="font-semibold">{entry.name}</p>
                        <p className="text-sm text-zinc-400">
                          Roblox ID: {entry.user_id}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-bold">
                          {formatNumber(entry.points)}
                        </p>

                        {change !== 0 && (
                          <p className="text-xs text-zinc-400">
                            {change > 0 ? `+${change}` : change}
                          </p>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
