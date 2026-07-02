"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

/* ================= TYPES ================= */

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
  startTime: number | string | null;
  endTime: number | string | null;
  clanRank: number | null;
  totalClans: number | null;
  totalPoints: number;
  participants: number;
  maxParticipants: number;
  topContributor: LeaderboardEntry | null;
};

/* ================= SAFE TIME ================= */

function toMs(value: number | string | null): number | null {
  if (!value) return null;

  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));

  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${d}d ${h}h ${m}m ${s}s`;
}

/* ================= PAGE ================= */

export default function WarInfoPage() {
  const [war, setWar] = useState<WarApiData | null>(null);
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [events, setEvents] = useState<WarEvent[]>([]);
  const [now, setNow] = useState(Date.now());

  const prevPlayersRef = useRef<LeaderboardEntry[]>([]);

  /* ================= LOAD WAR ================= */

  useEffect(() => {
    async function loadWar() {
      try {
        const res = await fetch("/api/war", { cache: "no-store" });
        const json = await res.json();

        if (!json?.success) {
          setWar(null);
          return;
        }

        setWar(json);
      } catch {
        setWar(null);
      }
    }

    loadWar();
    const i = setInterval(loadWar, 10000);
    return () => clearInterval(i);
  }, []);

  /* ================= LOAD PLAYERS ================= */

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        const json = await res.json();

        const next: LeaderboardEntry[] = Array.isArray(json.data)
          ? json.data
          : [];

        const prev = prevPlayersRef.current;
        const newEvents: WarEvent[] = [];

        /* 🔥 FIX: show initial feed state */
        if (prev.length === 0 && next.length > 0) {
          newEvents.push({
            id: crypto.randomUUID(),
            type: "milestone",
            text: `⚔️ Tracking ${next.length} players live`,
            timestamp: Date.now(),
          });
        }

        next.forEach((p) => {
          const old = prev.find((x) => x.user_id === p.user_id);
          if (!old) return;

          const diff = p.points - old.points;

          if (diff > 0) {
            newEvents.push({
              id: crypto.randomUUID(),
              type: "points",
              text: `🔥 ${p.name} +${diff.toLocaleString()} points`,
              timestamp: Date.now(),
            });
          }

          if (old.rank && p.rank < old.rank) {
            newEvents.push({
              id: crypto.randomUUID(),
              type: "rank",
              text: `📈 ${p.name} moved to #${p.rank}`,
              timestamp: Date.now(),
            });
          }

          if (p.rank === 1 && old.rank !== 1) {
            newEvents.push({
              id: crypto.randomUUID(),
              type: "milestone",
              text: `👑 New leader: ${p.name}`,
              timestamp: Date.now(),
            });
          }
        });

        prevPlayersRef.current = next;
        setPlayers(next);
        setEvents((e) => [...newEvents, ...e].slice(0, 10));
      } catch {}
    }

    loadPlayers();
    const i = setInterval(loadPlayers, 10000);
    return () => clearInterval(i);
  }, []);

  /* ================= CLOCK ================= */

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  /* ================= SAFE CALCS ================= */

  const startMs = toMs(war?.startTime ?? null);
  const endMs = toMs(war?.endTime ?? null);

  const valid = startMs !== null && endMs !== null && endMs > startMs;

  const timeLeft = valid ? Math.max(0, endMs! - now) : null;

  const progress = valid
    ? Math.min(100, ((now - startMs!) / (endMs! - startMs!)) * 100)
    : 0;

  const totalPoints = useMemo(
    () => players.reduce((a, b) => a + (b.points || 0), 0),
    [players]
  );

  const top = useMemo(
    () => [...players].sort((a, b) => b.points - a.points)[0],
    [players]
  );

  /* 🔥 FIX: clan rank fallback */
  const clanRank =
    war?.clanRank ??
    (players[0] as any)?.clanRank ??
    null;

  /* ================= UI ================= */

  return (
    <main className="min-h-screen bg-black text-white">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 pt-16">

        {/* HEADER */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold">
            {war?.warName ?? "No Active War"}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            ⚔️ Real war dashboard
          </p>
        </div>

        {/* TIMER */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-sm text-zinc-400">Time Remaining</p>

          <h2 className="text-4xl font-bold text-emerald-300">
            {timeLeft !== null ? formatDuration(timeLeft) : "—"}
          </h2>

          {/* 🔥 UPGRADED PROGRESS BAR */}
          <div className="relative mt-6 h-4 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">

            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 blur-md" />

            <div
              className="relative h-full rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-500 transition-all duration-700"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 20px rgba(16,185,129,0.6)",
              }}
            />

            <div className="absolute inset-0 animate-pulse bg-white/10 opacity-20" />
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {progress.toFixed(1)}% complete
          </p>
        </div>

        {/* STATS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="War Points" value={totalPoints} />
          <Stat label="Participants" value={players.length} />
          <Stat label="Clan Rank" value={clanRank ? `#${clanRank}` : "—"} />
        </div>

        {/* TOP CONTRIBUTOR */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-bold">Top Contribution</h2>

          {top ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold">{top.name}</p>
                <p className="text-sm text-zinc-400">👑 Leading the war</p>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-300">
                  {top.points.toLocaleString()}
                </p>
                <p className="text-xs uppercase tracking-widest text-zinc-500">
                  points
                </p>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500">No data</p>
          )}
        </div>

        {/* LIVE FEED */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 font-bold">Live Feed</h2>

          <div className="space-y-2">
            {events.length ? (
              events.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-white/10 bg-black/30 p-2 text-sm"
                >
                  {e.text}
                </div>
              ))
            ) : (
              <p className="text-zinc-500">No activity yet...</p>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

/* ================= STAT CARD ================= */

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
