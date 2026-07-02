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

/* ================= SAFE TIME PARSER ================= */

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

  /* ================= WAR LOAD ================= */

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

  /* ================= PLAYERS LOAD ================= */

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

  /* ================= SAFE WAR CALCS ================= */

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

          <div className="mt-6 h-3 w-full rounded-full bg-black/40 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {progress.toFixed(1)}% complete
          </p>
        </div>

        {/* STATS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="War Points" value={totalPoints} />
          <Stat label="Participants" value={players.length} />
          <Stat label="Clan Rank" value={`#${war?.clanRank ?? "—"}`} />
        </div>

        {/* TOP */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-bold">Top Contribution</h2>

          {top ? (
            <>
              <p className="text-xl font-semibold">{top.name}</p>
              <p className="text-emerald-300">
                {top.points.toLocaleString()} points
              </p>
            </>
          ) : (
            <p className="text-zinc-500">No data</p>
          )}
        </div>

        {/* FEED */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 font-bold">Live Feed</h2>

          <div className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-white/10 bg-black/30 p-2 text-sm"
              >
                {e.text}
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

function Stat({ label, value }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
