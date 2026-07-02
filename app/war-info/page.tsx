"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type WarData = {
  active: boolean;
  opponent: string;
  mcwv_points: number;
  enemy_points: number;
  ends_at: string; // ISO date from API
};

export default function WarInfoPage() {
  const [war, setWar] = useState<WarData | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/war", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();
        setWar(data);
      } catch {}
    }

    load();
    const interval = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, []);

  if (!war) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading war data...
      </main>
    );
  }

  const timeLeft = new Date(war.ends_at).getTime() - now;

  const formatTime = (ms: number) => {
    if (ms <= 0) return "ENDED";

    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    return `${h}h ${m}m ${s}s`;
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      {/* ⚔️ HEADER */}
      <section className="mx-auto max-w-6xl px-4 py-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
          ⚔️ ACTIVE WAR MODE
        </div>

        <h1 className="mt-4 text-4xl font-bold">MCWV War Room</h1>

        <p className="mt-2 text-zinc-400">
          MCWV vs {war.opponent}
        </p>
      </section>

      {/* ⏳ TIMER */}
      <section className="mx-auto max-w-3xl px-4 text-center">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-sm text-zinc-400">Time Remaining</p>
          <p className="mt-2 text-4xl font-bold text-red-400">
            {formatTime(timeLeft)}
          </p>
        </div>
      </section>

      {/* ⚔️ CLAN VS CLAN */}
      <section className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-6 px-4">

        {/* MCWV */}
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-8 text-center">
          <h2 className="text-xl font-bold text-emerald-300">MCWV</h2>
          <p className="mt-4 text-4xl font-bold">
            {war.mcwv_points.toLocaleString()}
          </p>
        </div>

        {/* ENEMY */}
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-8 text-center">
          <h2 className="text-xl font-bold text-red-300">
            {war.opponent}
          </h2>
          <p className="mt-4 text-4xl font-bold">
            {war.enemy_points.toLocaleString()}
          </p>
        </div>

      </section>

      {/* 🔥 STATUS */}
      <section className="mx-auto mt-10 max-w-4xl px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          {war.mcwv_points > war.enemy_points ? (
            <p className="text-emerald-300 font-semibold">
              🟢 MCWV is currently WINNING
            </p>
          ) : war.mcwv_points < war.enemy_points ? (
            <p className="text-red-300 font-semibold">
              🔴 MCWV is currently LOSING
            </p>
          ) : (
            <p className="text-yellow-300 font-semibold">
              ⚖️ WAR IS TIED
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
