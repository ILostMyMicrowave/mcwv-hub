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
    <div
      className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white ring-1"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
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
    1: "from-[var(--primary)]/25 to-transparent ring-[var(--primary)]/30",
    2: "from-[var(--accent)]/20 to-transparent ring-[var(--border)]",
    3: "from-[var(--primary)]/15 to-transparent ring-[var(--accent)]/20",
  }[place];

  const crowns = { 1: "🥇", 2: "🥈", 3: "🥉" }[place];

  return (
    <div
      className={`relative rounded-3xl border p-5 shadow-2xl backdrop-blur transition-all duration-300 hover:-translate-y-1 ${className}`}
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      {place === 1 && (
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{ background: "var(--glow)" }}
        />
      )}

      {entry ? (
        <>
          <div className="mb-4 flex items-center justify-center">
            <div className="relative flex items-center justify-center">

              {place === 1 && (
                <div
                  className="pointer-events-none absolute -z-10 h-28 w-28 animate-pulse rounded-full blur-2xl"
                  style={{ background: "var(--primary)", opacity: 0.25 }}
                />
              )}

              {place === 1 && (
                <div className="pointer-events-none absolute -top-4 animate-bounce text-2xl">
                  👑
                </div>
              )}

              {entry.avatar ? (
                <img
                  src={entry.avatar}
                  alt={entry.name}
                  className={`h-20 w-20 rounded-full object-cover ring-4 ${
                    place === 1
                      ? "ring-[var(--primary)]/30"
                      : "ring-[var(--border)]"
                  }`}
                />
              ) : (
                <div
                  className={`h-20 w-20 rounded-full ring-4 ${
                    place === 1
                      ? "ring-[var(--primary)]/30"
                      : "ring-[var(--border)]"
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
            <p className="mt-1 text-sm text-white/70">
              {formatNumber(entry.points)} points
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-white/50">
              {entry.discord_id ? "Discord linked" : "No Discord link"}
            </p>
          </div>
        </>
      ) : (
        <div className="py-10 text-center text-white/50">
          Waiting for data
        </div>
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

  return (
    <main
      className="min-h-screen px-4 py-8 text-white sm:px-6 lg:px-10"
      style={{ background: "var(--background)" }}
    >
      <div className="mx-auto max-w-6xl">

        <div
          className="mb-6 rounded-3xl border p-6 backdrop-blur"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

            <div>
              <div
                className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--primary)",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: active ? "var(--primary)" : "var(--border)",
                  }}
                />
                {active ? "Live war tracking" : "No active war right now"}
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {title}
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-white/60">
                Live updates refresh every 10 seconds.
              </p>
            </div>

            <div className="text-sm text-white/60">
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
          <div
            className="rounded-3xl border p-8 text-center"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            Loading leaderboard...
          </div>
        ) : error ? (
          <div
            className="rounded-3xl border p-8 text-center"
            style={{ background: "var(--card)", borderColor: "red" }}
          >
            {error}
          </div>
        ) : (
          <>
            <section className={`mb-16 transition-all duration-500 ${flash ? "scale-[1.01]" : ""}`}>
              <div className="mb-4 text-lg font-semibold text-white">
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

            <section className="rounded-3xl border p-4 shadow-2xl backdrop-blur sm:p-6"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Full leaderboard</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">
                  Auto refresh
                </span>
              </div>

              <div className="space-y-3">
                {data.map((entry) => {
                  const change = rankChange[entry.user_id] ?? 0;

                  return (
                    <a
                      key={entry.user_id}
                      href={`/profile?roblox_id=${entry.user_id}`}
                      className="group flex items-center gap-4 rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5"
                      style={{
                        background: "var(--card)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
                        style={{ background: "var(--background)" }}
                      >
                        #{entry.rank}
                      </div>

                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {entry.avatar ? (
                          <img
                            src={entry.avatar}
                            alt={entry.name}
                            className="h-full w-full object-cover"
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

                          <span
                            className="rounded-full px-2 py-0.5 text-[11px]"
                            style={{
                              background: "var(--background)",
                              color: "white",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {entry.discord_id ? "Discord linked" : "Not linked"}
                          </span>
                        </div>

                        <p className="truncate text-sm text-white/60">
                          Roblox ID: {entry.user_id}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-white">
                          {formatNumber(entry.points)}
                        </div>
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
