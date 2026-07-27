"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type RecapNumber = {
  before: number | null;
  now: number | null;
  delta: number | null;
};

type RecapResponse = {
  success?: boolean;
  show?: boolean;
  username?: string;
  minutesSince?: number;
  previousSeenAt?: string;
  player?: {
    points: RecapNumber;
    rank: RecapNumber;
    lastHour: number;
    last5m: number;
  };
  clan?: {
    points: RecapNumber;
    rank: RecapNumber;
    target?: { name: string; gap: number; rank: number; points: number } | null;
    threat?: { name: string; gap: number; rank: number; points: number } | null;
  };
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatRank(value: number | null | undefined) {
  return value ? `#${value}` : "—";
}

function deltaText(delta: number | null | undefined, type: "points" | "rank") {
  if (delta === null || delta === undefined || delta === 0) return "No change";
  if (type === "rank") return delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
  return delta > 0 ? `+${formatNumber(delta)}` : `-${formatNumber(Math.abs(delta))}`;
}

function DeltaPill({ delta, type }: { delta: number | null | undefined; type: "points" | "rank" }) {
  const positive = Number(delta ?? 0) > 0;
  const neutral = !delta;
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
        neutral
          ? "border-white/10 bg-white/5 text-zinc-400"
          : positive
          ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-200"
          : "border-rose-300/30 bg-rose-300/15 text-rose-200"
      }`}
    >
      {deltaText(delta, type)}
    </span>
  );
}

function RecapRow({ label, before, now, delta, type }: { label: string; before: string; now: string; delta: number | null | undefined; type: "points" | "rank" }) {
  return (
    <div className="grid grid-cols-[1fr_0.9fr_0.9fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm">
      <div className="font-semibold text-zinc-200">{label}</div>
      <div className="text-zinc-500">{before}</div>
      <div className="font-bold text-white">{now}</div>
      <DeltaPill delta={delta} type={type} />
    </div>
  );
}

export default function WarReturnRecap() {
  const pathname = usePathname();
  const router = useRouter();
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") return;
    let alive = true;
    let lastCheckedAt = 0;

    async function load(force = false) {
      if (!force && Date.now() - lastCheckedAt < 10 * 60 * 1000) return;
      lastCheckedAt = Date.now();

      const res = await fetch("/api/war/personal-recap", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const json: RecapResponse = await res.json().catch(() => ({}));
      if (!alive) return;
      if (json.show) {
        setRecap(json);
        setOpen(true);
      }
    }

    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        void load(false);
      }
    }

    const timer = window.setTimeout(() => void load(true), 900);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [pathname]);

  if (!open || !recap) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-6">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setOpen(false)} aria-label="Close war recap" />
      <div className="war-recap-panel relative z-10 max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.22),transparent_34%),linear-gradient(135deg,rgba(24,24,27,0.98),rgba(3,7,18,0.98))] shadow-2xl shadow-black/50">
        <div className="absolute inset-0 opacity-40 [background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] war-recap-sheen" />
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> War recap
              </div>
              <h2 className="mt-4 text-3xl font-black text-white sm:text-5xl">Welcome back, {recap.username ?? "member"}</h2>
              <p className="mt-2 text-sm text-zinc-300">
                Here’s what changed since you last checked{recap.minutesSince ? ` ${recap.minutesSince} minutes ago` : ""}.
              </p>
            </div>
            <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/10" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="grid grid-cols-[1fr_0.9fr_0.9fr_auto] gap-3 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                <span>Stat</span><span>Last check</span><span>Now</span><span>Change</span>
              </div>
              <RecapRow
                label="Your points"
                before={formatNumber(recap.player?.points.before)}
                now={formatNumber(recap.player?.points.now)}
                delta={recap.player?.points.delta}
                type="points"
              />
              <RecapRow
                label="Your rank"
                before={formatRank(recap.player?.rank.before)}
                now={formatRank(recap.player?.rank.now)}
                delta={recap.player?.rank.delta}
                type="rank"
              />
              <RecapRow
                label="MCWV points"
                before={formatNumber(recap.clan?.points.before)}
                now={formatNumber(recap.clan?.points.now)}
                delta={recap.clan?.points.delta}
                type="points"
              />
              <RecapRow
                label="MCWV rank"
                before={formatRank(recap.clan?.rank.before)}
                now={formatRank(recap.clan?.rank.now)}
                delta={recap.clan?.rank.delta}
                type="rank"
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Your latest push</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-zinc-500">Last hour</div>
                    <div className="mt-1 text-2xl font-black text-white">+{formatNumber(recap.player?.lastHour ?? 0)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-zinc-500">Last 5 min</div>
                    <div className="mt-1 text-2xl font-black text-white">+{formatNumber(recap.player?.last5m ?? 0)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Clan situation</div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  MCWV is currently <span className="font-bold text-white">{formatRank(recap.clan?.rank.now)}</span>.
                  {recap.clan?.target ? ` Need ${formatNumber(recap.clan.target.gap)} points to pass ${recap.clan.target.name}.` : " No next target is available yet."}
                  {recap.clan?.threat ? ` ${recap.clan.threat.name} is ${formatNumber(recap.clan.threat.gap)} points behind us.` : ""}
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10" onClick={() => router.push("/leaderboard")}>View Leaderboard</button>
                <button className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-black transition hover:scale-[1.03]" onClick={() => router.push("/war-analyst")}>Open Battle HQ</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes recapIn {
          from { opacity: 0; transform: translateY(18px) scale(0.96); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes recapSheen {
          from { transform: translateX(-120%) rotate(10deg); }
          to { transform: translateX(160%) rotate(10deg); }
        }
        .war-recap-panel { animation: recapIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .war-recap-sheen { animation: recapSheen 2.8s ease-out forwards; }
      `}</style>
    </div>
  );
}
