"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";
import Podium from "@/components/Podium";

type LeaderboardEntry = {
  user_id: number;
  name: string;
  points: number;
  rank: number;
  avatar: string | null;
};

type EventItem = {
  id: string;
  text: string;
  type: "points" | "rankup" | "rankdown" | "crown";
};

type LeaderboardResponse = {
  success: boolean;
  active?: boolean;
  title?: string;
  total_points?: number;
  updatedAt?: string;
  data: LeaderboardEntry[];
  error?: string;
};

/* ---------------- UI HELPERS ---------------- */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5 backdrop-blur transition hover:scale-[1.01]"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
        {label}
      </p>

      <p className="mt-3 text-2xl font-bold text-white">{value}</p>

      {sub && <p className="mt-2 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ---------------- HOME ---------------- */

export default function HomePage() {
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<EventItem[]>([]);
  const [active, setActive] = useState(false);
  const prevRef = useRef<LeaderboardEntry[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) return;

        const data: LeaderboardResponse = await res.json();
        const next = Array.isArray(data.data) ? data.data : [];

        setPlayers(next);
        setActive(!!data.active);

        if (!prevRef.current.length) {
          setActivity([
            {
              id: crypto.randomUUID(),
              type: "points",
              text: `Tracking ${next.length} players`,
            },
          ]);
        }

        prevRef.current = next;
      } catch {}
    }

    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const top = players.slice(0, 5);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="text-5xl font-bold sm:text-6xl">MCWV Hub</h1>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            Real-time clan tracking, leaderboard insights, and war analytics.
          </p>
        </section>

        {/* STATS */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-3">
          <StatCard label="Live Players" value={top.length} />
          <StatCard label="System Status" value={active ? "LIVE" : "IDLE"} />
          <StatCard label="Tracking" value={active ? "ACTIVE" : "PAUSED"} />
        </section>

        {/* MAIN GRID */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 lg:grid-cols-3">
          
          {/* PODIUM */}
          <div className="lg:col-span-2">
            <Podium players={top} />
          </div>

          {/* SIDE PANEL */}
          <div className="space-y-4">

            {/* DISCORD */}
            <Panel
              title="Clan Discord"
              action={
                <a
                  href="https://discord.gg"
                  className="text-xs text-emerald-300 hover:underline"
                >
                  Open
                </a>
              }
            >
              <p className="text-sm text-zinc-400">
                Join the clan Discord to stay updated with wars, announcements, and
                recruitment.
              </p>

              <a
                href="https://discord.gg"
                className="mt-3 block rounded-xl bg-emerald-500 px-4 py-2 text-center text-sm font-semibold text-black"
              >
                Join Discord
              </a>
            </Panel>

            {/* SNAPSHOT (CLEANED) */}
            <Panel title="Clan Snapshot">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Active Battle</span>
                  <span className="text-white">
                    {active ? "Running" : "Inactive"}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-400">
                  <span>Tracked Players</span>
                  <span className="text-white">{players.length}</span>
                </div>

                <div className="flex justify-between text-zinc-400">
                  <span>Leaderboard</span>
                  <span className="text-white">Live</span>
                </div>
              </div>
            </Panel>

          </div>
        </section>

        {/* ACTIVITY FEED */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <Panel title="Live Activity Feed">
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {activity.length === 0 ? (
                <p className="text-sm text-zinc-400">Waiting for activity...</p>
              ) : (
                activity.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    {e.text}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}
