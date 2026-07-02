"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type WarEvent = {
  id: string;
  text: string;
  type: "points" | "rank" | "milestone";
  timestamp: number;
};

type WarData = {
  active: boolean;
  warName: string;
  startTime: string;
  endTime: string;
  totalPoints: number;
  rank: number;
  participants: number;
  maxParticipants: number;
  events: WarEvent[];
};

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function WarInfoPage() {
  const [war, setWar] = useState<WarData | null>(null);
  const [now, setNow] = useState(Date.now());

  // ⏳ LIVE COUNTDOWN TIMER (1s tick)
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // 🔁 API FETCH (10s refresh)
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/war", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        setWar(data);
      } catch {}
    }

    load();
    const interval = setInterval(load, 10000);

    return () => clearInterval(interval);
  }, []);

  const timeLeft = useMemo(() => {
    if (!war?.endTime) return 0;
    return new Date(war.endTime).getTime() - now;
  }, [war, now]);

  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        {/* ⚔️ HEADER */}
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold">
                ⚔️ {war?.warName ?? "Loading War..."}
              </h1>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  war?.active
                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/20"
                    : "bg-zinc-500/10 text-zinc-400 border border-zinc-600/20"
                }`}
              >
                {war?.active ? "LIVE" : "INACTIVE"}
              </span>
            </div>

            <p className="mt-2 text-sm text-zinc-400">
              Live war dashboard tracking clan performance in real time.
            </p>
          </div>
        </section>

        {/* ⏳ COUNTDOWN */}
        <section className="mx-auto max-w-6xl px-4 mt-8">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <p className="text-sm text-zinc-400 mb-2">Time Remaining</p>

            <h2 className="text-5xl font-bold tracking-wider text-emerald-300">
              {formatTime(timeLeft)}
            </h2>

            <p className="mt-3 text-xs text-zinc-500">
              Ends: {war?.endTime ? new Date(war.endTime).toLocaleString() : "—"}
            </p>
          </div>
        </section>

        {/* 📊 STATS */}
        <section className="mx-auto max-w-6xl px-4 mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">War Points</p>
            <p className="mt-2 text-2xl font-bold">
              {war?.totalPoints?.toLocaleString() ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Rank</p>
            <p className="mt-2 text-2xl font-bold">#{war?.rank ?? "-"}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Participants</p>
            <p className="mt-2 text-2xl font-bold">
              {war?.participants ?? 0}/{war?.maxParticipants ?? 75}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Status</p>
            <p className="mt-2 text-2xl font-bold text-emerald-300">
              {war?.active ? "LIVE" : "OFFLINE"}
            </p>
          </div>
        </section>

        {/* 📈 SNAPSHOT */}
        <section className="mx-auto max-w-6xl px-4 mt-10">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold mb-4">War Snapshot</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-black/20 p-4 border border-white/10">
                Current Rank: <span className="font-bold">#{war?.rank ?? "-"}</span>
              </div>

              <div className="rounded-xl bg-black/20 p-4 border border-white/10">
                Total Points:{" "}
                <span className="font-bold">
                  {war?.totalPoints?.toLocaleString() ?? 0}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 🔥 LIVE FEED */}
        <section className="mx-auto max-w-6xl px-4 mt-10 pb-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Live War Feed</h2>

              <span className="text-xs text-emerald-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            </div>

            <div className="space-y-2">
              {war?.events?.length ? (
                war.events
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((e) => (
                    <div
                      key={e.id}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                    >
                      {e.text}
                    </div>
                  ))
              ) : (
                <p className="text-sm text-zinc-500">
                  No war activity yet...
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
