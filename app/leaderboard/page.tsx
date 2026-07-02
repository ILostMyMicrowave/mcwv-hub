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
      className={`relative rounded-3xl border border-white/10 bg-gradient-to-b ${styles} p-5 shadow-2xl shadow-black/30 backdrop-blur ${className}`}
    >
      {entry ? (
        <>
          <div className="mb-4 flex items-center justify-center">
            {entry.avatar ? (
              <img
                src={entry.avatar}
                alt={entry.name}
                className={`h-20 w-20 rounded-full object-cover ring-4 ${
                  place === 1 ? "ring-yellow-300/30" : "ring-white/15"
                }`}
              />
            ) : (
              <InitialAvatar name={entry.name} />
            )}
          </div>

          <div className="text-center">
            <div className="mb-1 text-2xl">{crowns}</div>
            <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
            <p className="mt-1 text-sm text-zinc-300">
              {formatNumber(entry.points)} points
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
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold
