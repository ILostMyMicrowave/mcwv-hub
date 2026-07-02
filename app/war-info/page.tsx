"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type LeaderboardEntry = {
  user_id: number;
  name: string;
  points: number;
  rank: number;
};

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function WarInfoPage() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [now, setNow] = useState(Date.now());

  // ⏳ fake war end (you can change later)
  const warEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2); // 2 day “war window”
    return d.getTime();
  }, []);

  // 🔁 FETCH REAL LEADERBOARD
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const json = await res.json();
        const next = Array.isArray(json.data) ? json.data : [];

        setData(next);
      } catch {}
    }

    load();
    const interval = setInterval(load, 10000);

    return () => clearInterval(interval);
  }, []);

  // ⏳ REAL TIMER (1s tick)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const totalPoints = useMemo(() => {
    return data.reduce((sum, p) => sum + (p.points || 0), 0);
  }, [data]);

  const participants = data.length;

  const topRank = data[0];

  const timeLeft = warEnd - now;

  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        {/* ⚔️ HEADER */}
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h1 className="text-3xl font-bold">
              ⚔️ LIVE WAR DASHBOARD
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              Real-time clan performance tracking using live leaderboard data.
            </p>
          </div>
        </section>

        {/* ⏳ COUNTDOWN */}
        <section className="mx-auto max-w-6xl px-4 mt-8">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-sm text-zinc-400 mb-2">Time Remaining</p>

            <h2 className="text-5xl font-bold text-emerald-300">
              {formatTime(timeLeft)}
            </h2>
          </div>
        </section>

        {/* 📊 STATS */}
        <section className="mx-auto max-w-6xl px-4 mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Total War Points</p>
            <p className="mt-2 text-2xl font-bold">
              {totalPoints.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Participants</p>
            <p className="mt-2 text-2xl font-bold">
              {participants}/75
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Current Leader</p>
            <p className="mt-2 text-xl font-bold">
              {topRank?.name ?? "—"}
            </p>
          </div>
        </section>

        {/* 📈 SNAPSHOT */}
        <section className="mx-auto max-w-6xl px-4 mt-10">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold mb-4">
              War Snapshot
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-black/20 p-4 border border-white/10">
                Rank #1:{" "}
                <span className="font-bold">
                  {topRank?.name ?? "—"}
                </span>
              </div>

              <div className="rounded-xl bg-black/20 p-4 border border-white/10">
                Average Points:{" "}
                <span className="font-bold">
                  {participants
                    ? Math.floor(totalPoints / participants).toLocaleString()
                    : 0}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 🔥 LIVE FEEL (simple feed from leaderboard) */}
        <section className="mx-auto max-w-6xl px-4 mt-10 pb-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold mb-4">
              Live Activity (Live Leaderboard State)
            </h2>

            <div className="space-y-2">
              {data.slice(0, 10).map((p) => (
                <div
                  key={p.user_id}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                >
                  🔥 {p.name} — {p.points.toLocaleString()} points
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
