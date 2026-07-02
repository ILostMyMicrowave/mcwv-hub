"use client";

import { useEffect, useRef, useState } from "react";
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

      if (diff > 0) {
        events.push({
          id: crypto.randomUUID(),
          type: "points",
          text: `🔥 ${entry.name} +${diff} points`,
        });
      }

      if (old.rank && entry.rank < old.rank) {
        events.push({
          id: crypto.randomUUID(),
          type: "rankup",
          text: `📈 ${entry.name} moved to #${entry.rank}`,
        });
      }

      if (old.rank && entry.rank > old.rank) {
        events.push({
          id: crypto.randomUUID(),
          type: "rankdown",
          text: `📉 ${entry.name} dropped to #${entry.rank}`,
        });
      }

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
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();

        const next: LeaderboardEntry[] = Array.isArray(data.data)
          ? data.data.slice(0, 5)
          : [];

        const events = generateEvents(prevRef.current, next);

        prevRef.current = next;

        setTop(next);
        setActivity((prev) => [...events, ...prev].slice(0, 20));
      } catch {}
    }

    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-theme text-theme">
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        {/* HERO */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--primary)",
            }}
          >
            <span className="h-2 w-2 animate-pulse rounded-full"
              style={{ background: "var(--primary)" }}
            />
            LIVE CLAN SYSTEM
          </div>

          <h1 className="text-5xl font-bold sm:text-6xl">
            MCWV Hub
          </h1>

          <p className="mt-4 max-w-2xl opacity-70">
            Real-time leaderboard tracking, war stats, and clan performance analytics.
          </p>

          <a
            href="/leaderboard"
            className="mt-8 rounded-2xl px-6 py-3 text-sm font-semibold transition"
            style={{
              background: "var(--primary)",
              color: "#000",
            }}
          >
            View Leaderboard
          </a>
        </section>

        {/* STATS */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 sm:grid-cols-3">
          {[
            { label: "Live Players", value: top.length },
            { label: "System Status", value: "LIVE", highlight: true },
            { label: "Tracking", value: "ACTIVE" },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 text-center"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>
                {item.label}
              </p>

              <p
                className="mt-2 text-2xl font-bold"
                style={{
                  color: item.highlight ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {item.value}
              </p>
            </div>
          ))}
        </section>

        {/* PODIUM */}
        <Podium players={top} />

        {/* ACTIVITY FEED */}
        <section className="mx-auto max-w-6xl px-4 pb-16 mt-12">
          <div
            className="rounded-3xl p-6"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">LIVE ACTIVITY FEED</h2>

              <div className="flex items-center gap-2 text-xs"
                style={{ color: "var(--primary)" }}
              >
                <span className="h-2 w-2 animate-pulse rounded-full"
                  style={{ background: "var(--primary)" }}
                />
                LIVE
              </div>
            </div>

            <div className="space-y-2">
              {activity.length === 0 ? (
                <p style={{ opacity: 0.6 }}>
                  Waiting for activity...
                </p>
              ) : (
                activity.map((e, i) => (
                  <div
                    key={e.id}
                    className="rounded-xl px-3 py-2 text-sm"
                    style={{
                      background: i === 0 ? "var(--border)" : "transparent",
                      border: "1px solid var(--border)",
                    }}
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
