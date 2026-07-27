"use client";

import { useCallback, useEffect, useState } from "react";
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
    <div className="recap-row min-w-0 rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" style={{ animationDelay: delay }}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-bold text-white">{label}</div>
        <DeltaPill delta={delta} type={type} />
      </div>
      <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Last check</div>
          <div className="mt-1 truncate font-semibold text-zinc-300">{before}</div>
        </div>
        <div className="text-zinc-500">→</div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Now</div>
          <div className="mt-1 truncate text-base font-black text-white">
            {type === "points" && nowValue !== undefined ? <CountUpNumber value={nowValue} /> : now}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WarReturnRecap() {
  const pathname = usePathname();
  const router = useRouter();
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const closeModal = useCallback((afterClose?: () => void) => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      afterClose?.();
    }, 280);
  }, [closing]);

  const closeAndGo = useCallback((path: string) => {
    closeModal(() => router.push(path));
  }, [closeModal, router]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") return;
    let alive = true;
    let lastCheckedAt = 0;

    async function load(force = false) {
      const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugRecap") === "1";
      if (!debug && !force && Date.now() - lastCheckedAt < 10 * 60 * 1000) return;
      lastCheckedAt = Date.now();

      const endpoint = debug ? "/api/war/personal-recap?debug=1" : "/api/war/personal-recap";
      const res = await fetch(endpoint, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const json: RecapResponse = await res.json().catch(() => ({}));
      if (!alive) return;
      if (json.show) {
        setRecap(json);
        setClosing(false);
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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeModal]);

  if ((!open && !closing) || !recap) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-3 py-4">
      <button className={`recap-backdrop absolute inset-0 bg-black/85 backdrop-blur-lg ${closing ? "recap-backdrop-out" : ""}`} onClick={() => closeModal()} aria-label="Close war recap" />
      <div className={`war-recap-panel war-recap-border war-recap-bg isolate relative z-10 max-h-[92vh] w-full max-w-4xl overflow-y-auto overflow-x-hidden rounded-[2rem] border border-white/15 shadow-2xl shadow-black/60 ${closing ? "war-recap-panel-out" : ""}`}>
        <div className="war-recap-content relative min-w-0 overflow-x-hidden p-4 sm:p-5">
          <button
            type="button"
            onClick={() => closeModal()}
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-slate-950/85 text-xl font-black text-white shadow-xl transition hover:scale-110 hover:bg-rose-500/20"
            aria-label="Close recap"
          >
            ×
          </button>
          <div className="flex min-w-0 flex-col gap-4 pr-12 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> War recap
              </div>
              <h2 className="recap-title mt-3 max-w-full break-words text-2xl font-black leading-tight text-white sm:text-3xl">Welcome back, {recap.username ?? "member"}</h2>
              <p className="mt-2 max-w-2xl text-xs font-medium leading-5 text-zinc-200 sm:text-sm">
                Here’s what changed since you last checked{recap.minutesSince ? ` ${recap.minutesSince} minutes ago` : ""}.
              </p>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="min-w-0 space-y-2 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
              <div className="hidden grid-cols-[1fr_0.9fr_0.9fr_auto] gap-3 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400 sm:grid">
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

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Your latest push</div>
                <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/8 p-3">
                    <div className="text-xs text-zinc-500">Last hour</div>
                    <div className="mt-1 text-lg font-black text-white"><CountUpNumber value={recap.player?.lastHour ?? 0} prefix="+" /></div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/8 p-3">
                    <div className="text-xs text-zinc-500">Last 5 min</div>
                    <div className="mt-1 text-lg font-black text-white"><CountUpNumber value={recap.player?.last5m ?? 0} prefix="+" /></div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Clan situation</div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  MCWV is currently <span className="font-bold text-white">{formatRank(recap.clan?.rank.now)}</span>.
                  {recap.clan?.target ? ` Need ${formatNumber(recap.clan.target.gap)} points to pass ${recap.clan.target.name}.` : " No next target is available yet."}
                  {recap.clan?.threat ? ` ${recap.clan.threat.name} is ${formatNumber(recap.clan.threat.gap)} points behind us.` : ""}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button className="recap-cta w-full rounded-full border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto" onClick={() => closeAndGo("/leaderboard")}>View Leaderboard</button>
                <button className="recap-cta w-full rounded-full bg-emerald-300 px-4 py-2.5 text-sm font-bold text-black transition hover:scale-[1.03] sm:w-auto" onClick={() => closeAndGo("/war-analyst")}>Open Battle HQ</button>
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
        @keyframes recapOut {
          from { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          to { opacity: 0; transform: translateY(14px) scale(0.96); filter: blur(8px); }
        }
        @keyframes recapBackdropOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes recapBgDrift {
          0% { background-position: 0% 0%, 100% 100%, 0% 50%; }
          50% { background-position: 10% 6%, 90% 94%, 100% 50%; }
          100% { background-position: 0% 0%, 100% 100%, 0% 50%; }
        }
        @keyframes recapBorderSpin {
          from { filter: hue-rotate(0deg); }
          to { filter: hue-rotate(360deg); }
        }
        @keyframes recapRowIn {
          from { opacity: 0; transform: translateX(-18px) scale(0.98); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes recapImpactIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes recapTitleGlow {
          0%, 100% { text-shadow: 0 0 0 rgba(52,211,153,0); }
          50% { text-shadow: 0 0 28px rgba(52,211,153,0.28), 0 0 46px rgba(249,115,22,0.18); }
        }
        @keyframes recapDeltaPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }

        .war-recap-panel, .war-recap-content { box-sizing: border-box; }
        .war-recap-content * { min-width: 0; }
        .recap-backdrop { transition: opacity 0.28s ease; }
        .recap-backdrop-out { animation: recapBackdropOut 0.28s ease forwards; }
        .war-recap-bg {
          background-image:
            radial-gradient(circle at 12% 8%, rgba(16,185,129,0.34), transparent 28%),
            radial-gradient(circle at 90% 88%, rgba(249,115,22,0.24), transparent 30%),
            linear-gradient(135deg, rgba(15,23,42,0.99), rgba(2,6,23,0.995));
          background-size: 140% 140%, 140% 140%, 100% 100%;
          background-repeat: no-repeat;
          background-clip: padding-box;
          animation: recapIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards, recapBgDrift 9s ease-in-out infinite;
        }
        .war-recap-panel-out { animation: recapOut 0.28s cubic-bezier(0.7, 0, 0.84, 0) forwards !important; pointer-events: none; }
        .war-recap-panel { }
        .war-recap-border::before {
          content: "";
          position: absolute;
          inset: -2px;
          z-index: -1;
          border-radius: inherit;
          background: conic-gradient(from 180deg, rgba(52,211,153,0.75), rgba(249,115,22,0.65), rgba(250,204,21,0.55), rgba(52,211,153,0.75));
          animation: recapBorderSpin 5s linear infinite;
        }
        .recap-title { animation: recapTitleGlow 2.4s ease-in-out infinite; }
        .recap-row { opacity: 0; animation: recapRowIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .recap-delta:not(:empty) { animation: recapDeltaPulse 1.8s ease-in-out infinite; }
        .recap-cta { box-shadow: 0 0 0 rgba(52,211,153,0); }
        .recap-cta:hover { box-shadow: 0 0 24px rgba(52,211,153,0.22); transform: translateY(-1px) scale(1.03); }

        @media (max-width: 640px) {
          .war-recap-panel {
            border-radius: 1.25rem;
            max-height: 92vh;
            width: calc(100vw - 1.25rem) !important;
            max-width: calc(100vw - 1.25rem) !important;
            margin: 0 auto !important;
          }
          .war-recap-content {
            width: 100% !important;
            max-width: 100% !important;
          }
          .recap-title { animation-duration: 3.4s; overflow-wrap: anywhere; }
          .war-recap-border::before { inset: -1px; }
          .recap-row { width: 100%; }
        }
      `}</style>
    </div>
  );
}
