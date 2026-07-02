"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type LeaderboardEntry = {
  user_id: number;
  name: string;
  points: number;
  rank: number;
};

type EventItem = {
  id: string;
  text: string;
  type: "points" | "rankup" | "rankdown" | "crown";
};

export default function HomePage() {
  const [top, setTop] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<EventItem[]>([]);
  const prevRef = useRef<LeaderboardEntry[]>([]);

  function generateEvents(prev: LeaderboardEntry[], next: LeaderboardEntry[]) {
    const events: EventItem[] = [];

    next.forEach((entry) => {
      const old = prev.find((p) => p.user_id === entry.user_id);

      if (!old) return;

      const diff = entry.points - old.points;

      // 🔥 POINT GAIN
      if (diff > 0) {
        events.push({
          id: crypto.randomUUID(),
          type: "points",
          text: `🔥 ${entry.name} +${diff} points`,
        });
      }

      // 📈 RANK UP
      if (old.rank && entry.rank < old.rank) {
        events.push({
          id: crypto.randomUUID(),
          type: "rankup",
          text: `📈 ${entry.name} moved to #${entry.rank}`,
        });
      }

      // 📉 RANK DOWN
      if (old.rank && entry.rank > old.rank) {
        events.push({
          id: crypto.randomUUID(),
          type: "rankdown",
          text: `📉 ${entry.name} dropped to #${entry.rank}`,
        });
      }

      // 👑 NEW LEADER
      if (entry.rank === 1 && old.rank !== 1) {
        events.push({
          id: crypto.randomUUID(),
          type: "crown",
          text: `👑 NEW LEADER: ${entry.name}`,
        });
      }
    });

    return events;
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        const next: LeaderboardEntry[] = Array.isArray(data.data)
          ? data.data.slice(0, 5)
          : [];

        const events = generateEvents(prevRef.current, next);

        prevRef.current = next;

        setTop(next);

        setActivity((prev) =>
          [...events, ...prev].slice(0, 20)
        );
      } catch {}
    }

    load();

    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">
      {/* 🌌 BACKGROUND */}
      <AnimatedBackground />

      {/* CONTENT */}
      <div className="relative z-10">
        <Navbar />

        {/* HERO */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            LIVE CLAN SYSTEM
          </div>

          <h1 className="text-5xl font-bold sm:text-6xl">MCWV Hub</h1>

          <p className="mt-4 max-w-2xl text-zinc-400">
            Real-time leaderboard tracking, war stats, and clan performance analytics.
          </p>

          <a
            href="/leaderboard"
            className="mt-8 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            View Leaderboard
          </a>
        </section>

        {/* STATS */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-sm text-zinc-400">Live Players</p>
            <p className="mt-2 text-2xl font-bold">{top.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-sm text-zinc-400">System Status</p>
            <p className="mt-2 text-2xl font-bold text-emerald-400">LIVE</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-sm text-zinc-400">Tracking</p>
            <p className="mt-2 text-2xl font-bold">ACTIVE</p>
          </div>
        </section>

        {/* TOP 5 */}
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="mb-4 text-xl font-semibold">Top Players</h2>

          <div className="space-y-2">
            {top.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="text-zinc-300">{p.name}</span>
                <span className="font-bold">{p.points}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 🔥 LIVE ACTIVITY FEED */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6">

            {/* glow */}
            <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10" />

            {/* header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">LIVE ACTIVITY FEED</h2>

              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                LIVE
              </div>
            </div>

            {/* feed */}
            <div className="space-y-2">
              {activity.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Waiting for activity...
                </p>
              ) : (
                activity.map((e) => (
                  <div
                    key={e.id}
                    className={`
                      rounded-xl border px-3 py-2 text-sm animate-fade-in transition

                      ${
                        e.type === "points"
                          ? "bg-black/20 border-white/10 text-zinc-200"
                          : ""
                      }

                      ${
                        e.type === "rankup"
                          ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-300"
                          : ""
                      }

                      ${
                        e.type === "rankdown"
                          ? "bg-red-500/10 border-red-400/20 text-red-300"
                          : ""
                      }

                      ${
                        e.type === "crown"
                          ? "bg-yellow-500/10 border-yellow-400/30 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                          : ""
                      }
                    `}
                  >
                    {e.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
