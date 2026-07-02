"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

type LeaderboardEntry = {
rank: number;
user_id: number;
name: string;
points: number;
avatar: string | null;
discord_id: string | null;
};

type ApiResponse = {
success: boolean;
active?: boolean;
title?: string;
total_points?: number;
updatedAt?: string;
data: LeaderboardEntry[];
error?: string;
};

function formatNumber(n: number) {
return new Intl.NumberFormat("en-GB").format(n);
}

function InitialAvatar({ name }: { name: string }) {
const letter = (name?.trim()?.[0] ?? "?").toUpperCase();

return (
<div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-bold text-white ring-1 ring-white/10">
{letter}
</div>
);
}

function PodiumCard({
entry,
place,
className = "",
}: {
entry?: LeaderboardEntry;
place: 1 | 2 | 3;
className?: string;
}) {
const styles = {
1: "from-yellow-500/25 to-yellow-500/5 ring-yellow-400/30",
2: "from-zinc-300/20 to-zinc-300/5 ring-zinc-300/20",
3: "from-orange-500/20 to-orange-500/5 ring-orange-400/20",
}[place];

const crowns = { 1: "🥇", 2: "🥈", 3: "🥉" }[place];

return (
<div
className={relative rounded-3xl border border-white/10 bg-gradient-to-b ${styles} p-5 shadow-2xl shadow-black/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-black/50 ${className}}
>
{entry ? (
<>
<div className="mb-4 flex items-center justify-center">
{entry.avatar ? (
<img  
src={entry.avatar}  
alt={entry.name}  
className="h-20 w-20 rounded-full object-cover ring-4 ring-white/15"  
/>
) : (
<InitialAvatar name={entry.name} />
)}
</div>

<div className="text-center">  
        <div className="mb-1 text-2xl">{crowns}</div>  
        <h3 className="text-lg font-semibold text-white">{entry.name}</h3>  
        <p className="mt-1 text-sm text-zinc-300">  
          {formatNumber(entry.points)} points  
        </p>  
      </div>  
    </>  
  ) : (  
    <div className="py-10 text-center text-zinc-500">Waiting for data</div>  
  )}  
</div>

);
}

export default function LeaderboardPage() {
const [data, setData] = useState<LeaderboardEntry[]>([]);
const [title, setTitle] = useState("MCWV Leaderboard");
const [active, setActive] = useState(false);
const [updatedAt, setUpdatedAt] = useState<string | null>(null);
const [totalPoints, setTotalPoints] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [rankChange, setRankChange] = useState<Record<number, number>>({});
const [now, setNow] = useState(Date.now());

const prevSnapshot = useRef<string>("");
const prevRanksRef = useRef<Record<number, number>>({});

async function load() {
try {
const res = await fetch("/api/leaderboard", { cache: "no-store" });
const json: ApiResponse = await res.json();

if (!json.success) {  
    setError(json.error ?? "Failed to load leaderboard");  
    setData([]);  
    setLoading(false);  
    return;  
  }  

  const nextData = Array.isArray(json.data) ? json.data : [];  
  setData(nextData);  

  setTitle(json.title ?? "MCWV Leaderboard");  
  setActive(Boolean(json.active));  
  setUpdatedAt(new Date().toISOString());  
  setTotalPoints(Number(json.total_points ?? 0));  
  setError(null);  
  setLoading(false);  
} catch {  
  setError("Unknown error");  
  setData([]);  
  setLoading(false);  
}

}

useEffect(() => {
load();
const interval = setInterval(load, 10000);
const clock = setInterval(() => setNow(Date.now()), 1000);

return () => {  
  clearInterval(interval);  
  clearInterval(clock);  
};

}, []);

const podium = useMemo(() => data.slice(0, 3), [data]);

return (
<main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black text-white">

{/* ✅ NAVBAR NOW MATCHES ALL OTHER PAGES */}  
  <Navbar />  

  {/* SAME WRAPPER AS OTHER PAGES */}  
  <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">  

    <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">  
      <h1 className="text-3xl font-bold sm:text-4xl">  
        {title}  
      </h1>  
    </div>  

    {loading ? (  
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">  
        Loading...  
      </div>  
    ) : (  
      <section className="space-y-3">  
        {data.map((entry) => (  
          <div  
            key={entry.user_id}  
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4"  
          >  
            <span>#{entry.rank}</span>  
            <span>{entry.name}</span>  
            <span>{formatNumber(entry.points)}</span>  
          </div>  
        ))}  
      </section>  
    )}  
  </div>  
</main>

);
}
