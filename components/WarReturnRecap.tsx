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

function CountUpNumber({ value, prefix = "" }: { value: number | null | undefined; prefix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Math.max(0, Number(value ?? 0));
    const start = display;
    const duration = 900;
    const started = performance.now();
    let frame = 0;

    const tick = (time: number) => {
      const progress = Math.min((time - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(start + (target - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (value === null || value === undefined || !Number.isFinite(Number(value))) return <>{prefix}—</>;
  return <>{prefix}{formatNumber(display)}</>;
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
      className={`recap-delta rounded-full border px-2.5 py-1 text-xs font-bold ${
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

function RecapRow({
  label,
  before,
  now,
  delta,
  type,
  delay = "0ms",
  nowValue,
}: {
  label: string;
  before: string;
  now: string;
  delta: number | null | undefined;
  type: "points" | "rank";
  delay?: string;
  nowValue?: number | null;
}) {
  return (
    <div className="recap-row grid grid-cols-[1fr_0.9fr_0.9fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm" style={{ animationDelay: delay }}>
      <div className="font-semibold text-zinc-200">{label}</div>
      <div className="text-zinc-500">{before}</div>
      <div className="font-bold text-white">
        {type === "points" && nowValue !== undefined ? <CountUpNumber value={nowValue} /> : now}
      </div>
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
      <div className="war-recap-panel war-recap-border relative z-10 max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.22),transparent_34%),linear-gradient(135deg,rgba(24,24,27,0.98),rgba(3,7,18,0.98))] shadow-2xl shadow-black/50">
        <div className="absolute inset-0 opacity-40 [background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] war-recap-sheen" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 30 }).map((_, index) => (
            <span
              key={index}
              className="recap-particle absolute h-1.5 w-1.5 rounded-full"
              style={{
                left: `${(index * 37) % 100}%`,
                top: `${(index * 19) % 100}%`,
                animationDelay: `${index * 90}ms`,
                background: index % 3 === 0 ? "#34d399" : index % 3 === 1 ? "#f97316" : "#facc15",
              }}
            />
          ))}
        </div>
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> War recap
              </div>
              <h2 className="recap-title mt-4 text-3xl font-black text-white sm:text-5xl">Welcome back, {recap.username ?? "member"}</h2>
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
                nowValue={recap.player?.points.now}
                delay="80ms"
              />
              <RecapRow
                label="Your rank"
                before={formatRank(recap.player?.rank.before)}
                now={formatRank(recap.player?.rank.now)}
                delta={recap.player?.rank.delta}
                type="rank"
                delay="160ms"
              />
              <RecapRow
                label="MCWV points"
                before={formatNumber(recap.clan?.points.before)}
                now={formatNumber(recap.clan?.points.now)}
                delta={recap.clan?.points.delta}
                type="points"
                nowValue={recap.clan?.points.now}
                delay="240ms"
              />
              <RecapRow
                label="MCWV rank"
                before={formatRank(recap.clan?.rank.before)}
                now={formatRank(recap.clan?.rank.now)}
                delta={recap.clan?.rank.delta}
                type="rank"
                delay="320ms"
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Your latest push</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-zinc-500">Last hour</div>
                    <div className="mt-1 text-2xl font-black text-white"><CountUpNumber value={recap.player?.lastHour ?? 0} prefix="+" /></div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-zinc-500">Last 5 min</div>
                    <div className="mt-1 text-2xl font-black text-white"><CountUpNumber value={recap.player?.last5m ?? 0} prefix="+" /></div>
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
                <button className="recap-cta rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10" onClick={() => router.push("/leaderboard")}>View Leaderboard</button>
                <button className="recap-cta rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-black transition hover:scale-[1.03]" onClick={() => router.push("/war-analyst")}>Open Battle HQ</button>
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
        @keyframes recapBorderSpin {
          from { filter: hue-rotate(0deg); }
          to { filter: hue-rotate(360deg); }
        }
        @keyframes recapParticleFloat {
          0% { opacity: 0; transform: translateY(18px) scale(0.4); }
          20% { opacity: 0.85; }
          100% { opacity: 0; transform: translateY(-90px) scale(1.15); }
        }
        @keyframes recapRowIn {
          from { opacity: 0; transform: translateX(-18px) scale(0.98); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes recapTitleGlow {
          0%, 100% { text-shadow: 0 0 0 rgba(52,211,153,0); }
          50% { text-shadow: 0 0 28px rgba(52,211,153,0.28), 0 0 46px rgba(249,115,22,0.18); }
        }
        @keyframes recapDeltaPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        .war-recap-panel { animation: recapIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .war-recap-border::before {
          content: "";
          position: absolute;
          inset: -2px;
          z-index: -1;
          border-radius: inherit;
          background: conic-gradient(from 180deg, rgba(52,211,153,0.75), rgba(249,115,22,0.65), rgba(250,204,21,0.55), rgba(52,211,153,0.75));
          animation: recapBorderSpin 5s linear infinite;
        }
        .war-recap-sheen { animation: recapSheen 2.8s ease-out forwards; }
        .recap-particle { opacity: 0; box-shadow: 0 0 18px currentColor; animation: recapParticleFloat 3.2s ease-in-out infinite; }
        .recap-title { animation: recapTitleGlow 2.4s ease-in-out infinite; }
        .recap-row { opacity: 0; animation: recapRowIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .recap-delta:not(:empty) { animation: recapDeltaPulse 1.8s ease-in-out infinite; }
        .recap-cta { box-shadow: 0 0 0 rgba(52,211,153,0); }
        .recap-cta:hover { box-shadow: 0 0 24px rgba(52,211,153,0.22); transform: translateY(-1px) scale(1.03); }
      `}</style>
    </div>
  );
}
