"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type LeaderboardEntry = {
  user_id: number;
  name: string;
  points: number;
  rank: number;
  avatar: string | null;
  discord_id: string | null;
};

type WarEvent = {
  id: string;
  text: string;
  type: "points" | "rank" | "milestone";
  timestamp: number;
};

type WarApiData = {
  success?: boolean;
  active: boolean;
  warName: string | null;
  battleId: string | null;
  startTime: string | null;
  endTime: string | null;
  clanRank: number | null;
  totalClans: number | null;
  totalPoints: number;
  participants: number;
  maxParticipants: number;
  topContributor: LeaderboardEntry | null;
  topClans: any[];
  topPlayers: any[];
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatCompact(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function useCountUp(target: number, duration = 700) {
  const [display, setDisplay] = useState(target);
  const previousTargetRef = useRef(target);

  useEffect(() => {
    if (previousTargetRef.current === target) return;

    const from = previousTargetRef.current;
    previousTargetRef.current = target;

    let frame = 0;
    const start = performance.now();

    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (target - from) * progress);
      setDisplay(value);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return display;
}

export default function WarInfoPage() {
  const [war, setWar] = useState<WarApiData | null>(null);
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [events, setEvents] = useState<WarEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const [flashTop, setFlashTop] = useState(false);

  const prevPlayersRef = useRef<LeaderboardEntry[]>([]);
  const prevTopRef = useRef<{ user_id: number; points: number } | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadWar() {
      try {
        const res = await fetch("/api/war", { cache: "no-store" });
        if (!res.ok) return;

        const json = (await res.json()) as WarApiData;
        setWar(json);
      } catch {}
    }

    loadWar();
    const interval = setInterval(loadWar, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const next: LeaderboardEntry[] = Array.isArray(json.data) ? json.data : [];

        const nextEvents: WarEvent[] = [];

        next.forEach((entry) => {
          const old = prevPlayersRef.current.find((p) => p.user_id === entry.user_id);
          if (!old) return;

          const diff = entry.points - old.points;

          if (diff > 0) {
            nextEvents.push({
              id: crypto.randomUUID(),
              type: "points",
              text: `🔥 ${entry.name} gained +${diff.toLocaleString()} points`,
              timestamp: Date.now(),
            });
          }

          if (old.rank && entry.rank < old.rank) {
            nextEvents.push({
              id: crypto.randomUUID(),
              type: "rank",
              text: `📈 ${entry.name} moved up to #${entry.rank}`,
              timestamp: Date.now(),
            });
          }

          if (entry.rank === 1 && old.rank !== 1) {
            nextEvents.push({
              id: crypto.randomUUID(),
              type: "milestone",
              text: `👑 Top contribution: ${entry.name}`,
              timestamp: Date.now(),
            });
          }
        });

        prevPlayersRef.current = next;
        setPlayers(next);
        setEvents((prev) => [...nextEvents, ...prev].slice(0, 10));

        const ranked = [...next].sort((a, b) => b.points - a.points);
        const top = ranked[0];

        if (top) {
          const prevTop = prevTopRef.current;

          if (
            !prevTop ||
            prevTop.user_id !== top.user_id ||
            prevTop.points !== top.points
          ) {
            setFlashTop(true);

            if (flashTimeoutRef.current) {
              clearTimeout(flashTimeoutRef.current);
            }

            flashTimeoutRef.current = setTimeout(() => {
              setFlashTop(false);
            }, 450);
          }

          prevTopRef.current = {
            user_id: top.user_id,
            points: top.points,
          };
        }
      } catch {}
    }

    loadPlayers();
    const interval = setInterval(loadPlayers, 10000);

    return () => {
      clearInterval(interval);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  const topContributor = war?.topContributor ?? null;

  const startMs =
    war?.startTime && !Number.isNaN(Date.parse(war.startTime))
      ? new Date(war.startTime).getTime()
      : null;

  const endMs =
    war?.endTime && !Number.isNaN(Date.parse(war.endTime))
      ? new Date(war.endTime).getTime()
      : null;

  const durationMs =
    startMs !== null && endMs !== null ? Math.max(1, endMs - startMs) : null;

  const elapsedMs =
    startMs !== null && durationMs !== null
      ? Math.min(durationMs, Math.max(0, now - startMs))
      : null;

  const timeLeftMs =
    endMs !== null ? Math.max(0, endMs - now) : null;

  const progress =
    startMs !== null && endMs !== null
      ? Math.min(100, Math.max(0, ((now - startMs) / (endMs - startMs)) * 100))
      : null;

  const active = Boolean(war?.active);

  const animatedWarPoints = useCountUp(war?.totalPoints ?? 0, 900);
  const animatedTopPoints = useCountUp(topContributor?.points ?? 0, 700);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        <section className="mx-auto max-w-6xl px-4 pt-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div
                  className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                    active
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-zinc-600/20 bg-zinc-500/10 text-zinc-400"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      active ? "bg-emerald-400" : "bg-zinc-500"
                    } animate-pulse`}
                  />
                  {active ? "Live war tracking" : "No active war right now"}
                </div>

                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {war?.warName ?? "Loading war..."}
                </h1>

                <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                  Live war dashboard pulling real data from your PS99-powered API.
                </p>
              </div>

              <div className="text-sm text-zinc-400">
                <div>
                  Total points:{" "}
                  <span className="font-semibold text-white">
                    {animatedWarPoints.toLocaleString()}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    LIVE
                  </span>
                  <span className="text-sm text-zinc-300">
                    updated every 10s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-8 max-w-6xl px-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <p className="mb-2 text-sm text-zinc-400">Time Remaining</p>

            <h2 className="text-5xl font-bold tracking-wider text-emerald-300">
              {timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"}
            </h2>

            <p className="mt-3 text-xs text-zinc-500">
              Ends: {war?.endTime ? new Date(war.endTime).toLocaleString() : "—"}
            </p>

            <div className="mt-8">
              <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                <span>War progress</span>
                <span>{progress !== null ? `${progress.toFixed(0)}%` : "—"}</span>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-black/30 ring-1 ring-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 transition-all duration-1000 ease-out"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Started: {war?.startTime ? new Date(war.startTime).toLocaleString() : "—"}
                </span>
                <span>{elapsedMs !== null ? formatCompact(elapsedMs) : "—"} elapsed</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
            <p className="text-sm text-zinc-400">War Name</p>
            <p className="mt-2 text-lg font-bold">{war?.warName ?? "—"}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
            <p className="text-sm text-zinc-400">Total War Points</p>
            <p className="mt-2 text-2xl font-bold">
              {animatedWarPoints.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
            <p className="text-sm text-zinc-400">Participants</p>
            <p className="mt-2 text-2xl font-bold">
              {war?.participants ?? players.length}/75
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
            <p className="text-sm text-zinc-400">Global Clan Rank</p>
            <p className="mt-2 text-2xl font-bold">
              #{war?.clanRank ?? "—"} / {war?.totalClans ?? "—"}
            </p>
          </div>
        </section>

        <section className="mx-auto mt-10 grid max-w-6xl gap-4 px-4 lg:grid-cols-2">
          <div
            className={`rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 ${
              flashTop ? "scale-[1.02] shadow-2xl shadow-emerald-500/20" : ""
            }`}
          >
            <h2 className="mb-4 text-lg font-bold">Top Contribution</h2>

            {topContributor ? (
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition-all duration-300">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10">
                  {topContributor.avatar ? (
                    <img
                      src={topContributor.avatar}
                      alt={topContributor.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-800 text-lg font-bold">
                      {topContributor.name.trim()[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">
                    {topContributor.name}
                  </p>
                  <p className="text-sm text-zinc-400">
                    Rank #{topContributor.rank}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-white">
                    {animatedTopPoints.toLocaleString()}
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    points
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-zinc-500">
                Waiting for top contributor...
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Live War Feed</h2>
              <span className="flex items-center gap-2 text-xs text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                LIVE
              </span>
            </div>

            <div className="space-y-2">
              {events.length ? (
                events.map((e) => (
                  <div
                    key={e.id}
                    className="animate-fade-in rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm transition-all duration-300"
                  >
                    {e.text}
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No war activity yet...</p>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-6xl px-4 pb-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-lg font-bold">War Snapshot</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                Started:{" "}
                <span className="font-semibold">
                  {war?.startTime ? new Date(war.startTime).toLocaleString() : "—"}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                Ends:{" "}
                <span className="font-semibold">
                  {war?.endTime ? new Date(war.endTime).toLocaleString() : "—"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
