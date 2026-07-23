"use client";

import Navbar from "@/components/Navbar";
import WarHistoryDropdown from "@/components/WarHistoryDropdown";
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
      className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold"
      aria-hidden="true"
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
    1: "from-yellow-500/25 to-yellow-500/5 ring-yellow-400/30",
    2: "from-zinc-300/20 to-zinc-300/5 ring-zinc-300/20",
    3: "from-orange-500/20 to-orange-500/5 ring-orange-400/20",
  }[place];

  const crowns = { 1: "🥇", 2: "🥈", 3: "🥉" }[place];

  return (
    <Animated delay={`${place * 0.1}s`}>
      <div
        className={`relative overflow-hidden rounded-3xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)] ${className}`}
        style={{
          background: `linear-gradient(180deg, ${styles})`,
          borderColor: "var(--border)",
        }}
      >
        {place === 1 && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-4xl animate-bounce" aria-hidden="true">
            🏆
          </div>
        )}

        {entry ? (
          <>
            {place === 1 && (
              <div className="absolute -top-4 right-4 text-3xl animate-pulse" aria-hidden="true">
                👑
              </div>
            )}

            <div className="relative z-10">
              <div className="mb-3 flex justify-center">
                {entry.avatar ? (
                  <img
                    src={entry.avatar}
                    alt={entry.name}
                    className="h-24 w-24 rounded-full ring-4 ring-white/10 transition-all duration-300 hover:scale-105 hover:ring-primary/30"
                    loading="lazy"
                  />
                ) : (
                  <InitialAvatar name={entry.name} />
                )}
              </div>

              <div className="mb-2 flex items-center justify-center gap-2 text-2xl">
                {crowns}
              </div>

              <h3 className="text-xl font-bold text-white text-center">{entry.name}</h3>
              <p className="mt-1 text-sm text-zinc-300 text-center">{formatNumber(entry.points)} points</p>

              {/* ONLY CHANGE: pill styling */}
              <div className="mt-3 flex items-center justify-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                    entry.discord_id
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                      : "bg-zinc-800 text-zinc-400 border-zinc-600/50"
                  }`}
                  style={{ borderWidth: "1px" }}
                >
                  {entry.discord_id ? "Discord linked" : "Not linked"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="h-48 flex items-center justify-center text-zinc-500">
            Waiting for data
          </div>
        )}
      </div>
    </Animated>
  );
}

// CountUp component
function CountUp({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const start = previous.current;
    const end = value;
    previous.current = value;

    const duration = 1500;
    const startTime = performance.now();

    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{formatter(displayValue)}</span>;
}

// Animated wrapper
function Animated({ children, delay = "0ms" }: { children: React.ReactNode; delay?: string }) {
  return (
    <div className="animate-fade-in" style={{ animationDelay: delay }}>
      {children}
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
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);

  const prevSnapshot = useRef("");
  const prevRanksRef = useRef<Record<number, number>>({});

  async function load() {
    try {
      const params = new URLSearchParams();
      if (selectedBattleId) {
        params.set("battle_id", selectedBattleId);
      }

      const res = await fetch(`/api/leaderboard?${params.toString()}`, {
        cache: "no-store",
      });
      const json: ApiResponse = await res.json();

      if (!json.success) {
        if (selectedBattleId && json.data?.length === 0) {
          setError(
            "No individual member data available for this historical battle. Data collection started after this war ended."
          );
        } else {
          setError(json.error ?? "Failed to load leaderboard");
        }
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
  }, [selectedBattleId]);

  const podium = useMemo(() => data.slice(0, 3), [data]);

  return (
    <>
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
        <div className="mb-8" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                {active ? "Live war tracking" : "No active war right now"}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Live updates refresh every 10 seconds. Roblox avatars and Discord-link badges
                appear automatically when the API provides them.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{
                  background: active ? "rgba(52, 211, 153, 0.2)" : "rgba(148, 163, 184, 0.15)",
                  color: active ? "#34d399" : "#94a3b8",
                  border: active ? "1px solid rgba(52, 211, 153, 0.3)" : "1px solid rgba(148, 163, 184, 0.2)",
                }}
              >
                {active && <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#34d399" }} />}
                {active ? "Live" : "Inactive"}
              </span>
              <WarHistoryDropdown selectedBattleId={selectedBattleId} onSelect={setSelectedBattleId} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <span>
              updated{" "}
              {updatedAt
                ? `${Math.max(1, Math.floor((now - new Date(updatedAt).getTime()) / 1000))}s ago`
                : "—"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-white font-semibold">{formatNumber(totalPoints)}</span>
              Total points
            </span>
          </div>
        </div>

        {loading ? (
          <Animated delay="0.1s">
            <div
              className="rounded-3xl border p-8 text-center animate-pulse"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="h-8 w-48 mx-auto rounded bg-zinc-800/50" />
              <div className="mt-4 h-4 w-32 mx-auto rounded bg-zinc-800/50" />
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="h-28 rounded-2xl bg-zinc-800/50" />
                <div className="h-28 rounded-2xl bg-zinc-800/50" />
                <div className="h-28 rounded-2xl bg-zinc-800/50" />
              </div>
            </div>
          </Animated>
        ) : error ? (
          <Animated delay="0.1s">
            <div
              className="rounded-3xl border p-6 text-center"
              style={{ background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.30)" }}
            >
              <svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="mt-3 text-lg font-semibold text-red-200">{error}</h2>
            </div>
          </Animated>
        ) : (
          <>
            <Animated delay="0.1s">
              <div className="mb-6">
                <h2 className="text-lg font-semibold">Top 3 podium</h2>
              </div>
            </Animated>
            <Animated delay="0.15s">
              <div className="grid gap-4 sm:grid-cols-3">
                <PodiumCard entry={podium[0]} place={1} />
                <PodiumCard entry={podium[1]} place={2} />
                <PodiumCard entry={podium[2]} place={3} />
              </div>
            </Animated>
            <Animated delay="0.25s">
              <div className="mt-8 mb-4">
                <h2 className="text-lg font-semibold">Full leaderboard</h2>
              </div>
            </Animated>
            <Animated delay="0.3s">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Auto refresh every 10s</span>
                {flash > 0 && <span className="text-xs text-emerald-300 animate-pulse">Data updated</span>}
              </div>
            </Animated>
            <div className="mt-4 space-y-2">
              {data.map((entry, index) => {
                const change = rankChange[entry.user_id] ?? 0;
                const isTop3 = index < 3;

                return (
                  <Animated key={entry.user_id} delay={`${Math.min(index * 0.02, 0.3)}s`}>
                    <div
                      className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)] ${isTop3 ? "bg-primary/5" : ""}`}
                      style={{
                        borderColor: isTop3 ? "var(--primary)" : "var(--border)",
                        background: isTop3 ? "rgba(52, 211, 153, 0.05)" : "rgba(0,0,0,0.14)",
                      }}
                    >
                      <div className="w-10 text-center">
                        <span className="font-bold text-white">#{entry.rank}</span>
                        <CountUp value={change > 0 ? change : change < 0 ? Math.abs(change) : 0} formatter={formatNumber} />
                        {change > 0 && <span className="text-emerald-300 text-xs">▲{change}</span>}
                        {change < 0 && <span className="text-rose-300 text-xs">▼{Math.abs(change)}</span>}
                      </div>
                      <div className="w-12 h-12 flex-shrink-0">
                        {entry.avatar ? (
                          <img src={entry.avatar} alt={entry.name} className="h-12 w-12 rounded-full ring-2 ring-white/10 transition-all duration-300 hover:scale-105 hover:ring-primary/30" loading="lazy" />
                        ) : (
                          <InitialAvatar name={entry.name} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{entry.name}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold ${entry.discord_id ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-600/50"}`} style={{ borderWidth: "1px" }}>
                            {entry.discord_id ? "Discord linked" : "Not linked"}
                          </span>
                          <span className="text-zinc-500">Roblox ID: {entry.user_id}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">{formatNumber(entry.points)}</p>
                        <p className="text-xs text-zinc-400">points</p>
                      </div>
                    </div>
                  </Animated>
                );
              })}
            </div>
          </>
        )}

        <style jsx global>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes gradientMove {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
          .animate-fade-in { opacity: 0; animation: fadeInUp .5s ease-out forwards; }
          .animate-gradientMove { animation: gradientMove 3s ease infinite; }
          @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
        `}</style>
      </div>
    </>
  );
}
