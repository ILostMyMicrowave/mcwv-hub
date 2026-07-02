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

/* ================= TIME ================= */

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

        prevPlayersRef.current = next;
        setPlayers(next);
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

  const valid =
    startMs !== null &&
    endMs !== null &&
    endMs > startMs;

  const timeLeftMs = valid ? Math.max(0, endMs! - now) : null;

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

  const clanRank = war?.clanRank;

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
            {timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"}
          </h2>

          {/* ✨ SMOOTH ANIMATED GRADIENT BAR */}
          <div className="mt-6 h-3 w-full rounded-full bg-black/40 overflow-hidden">
            <div
              className="
                h-full 
                bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400
                bg-[length:300%_100%]
                animate-gradientMove
                transition-all duration-500
              "
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

          <Stat
            label="Clan Rank"
            value={
              clanRank !== null && clanRank !== undefined
                ? `#${clanRank}`
                : "Unranked"
            }
          />
        </div>

        {/* TOP CONTRIBUTOR (PREMIUM STYLE) */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-bold">Top Contribution</h2>

          {top ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-6">

              {/* glow background */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 blur-2xl" />

              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold">
                    👑 {top.name}
                  </p>
                  <p className="text-sm text-zinc-400">
                    Leading the war
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-3xl font-bold text-emerald-300">
                    {top.points.toLocaleString()}
                  </p>
                  <p className="text-xs uppercase tracking-widest text-zinc-500">
                    points
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500">No data</p>
          )}
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
