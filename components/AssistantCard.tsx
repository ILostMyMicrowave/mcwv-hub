"use client";

import { useEffect, useState } from "react";

import type { AssistantCardData } from "@/lib/assistantEngine";
import { formatCompact } from "@/lib/numbers";

const fmt = (value: number) => formatCompact(value);

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Numbers count up when a card lands (instant for reduced-motion users).
 *  The keyframes live in the panel's injected stylesheet. */
function CountUpValue({
  value,
  delayMs = 0,
  durationMs = 650,
  className,
}: {
  value: number;
  delayMs?: number;
  durationMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(REDUCED_MOTION ? value : 0);
  useEffect(() => {
    if (REDUCED_MOTION) {
      setShown(value);
      return;
    }
    let raf = 0;
    let startAt = 0;
    const tick = (now: number) => {
      if (startAt === 0) startAt = now + delayMs;
      const t = startAt > now ? 0 : Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delayMs, durationMs]);
  return <span className={className}>{fmt(Math.round(shown))}</span>;
}

function CardTitle({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">
      {children}
    </div>
  );
}

// Horizontal bar chart — top scorers, movers, standings neighbors
function BarsCard({ card }: { card: Extract<AssistantCardData, { type: "bars" }> }) {
  const max = Math.max(...card.rows.map((row) => row.value), 1);
  return (
    <div className="pb-2">
      <CardTitle>{card.title}</CardTitle>
      <div className="mt-1 space-y-1">
        {card.rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1.5 px-2.5">
            {row.medal ? (
              <span className="w-5 shrink-0 text-center text-[10px] leading-none">{row.medal}</span>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-[10.5px] font-medium ${
                    row.highlight ? "text-violet-200" : "text-white/75"
                  }`}
                >
                  {row.label}
                </span>
                <CountUpValue
                  value={row.value}
                  delayMs={index * 80}
                  className={`shrink-0 text-[10px] tabular-nums ${
                    row.highlight ? "text-violet-200" : "text-white/50"
                  }`}
                />
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${
                    row.highlight
                      ? "bg-gradient-to-r from-violet-500 to-fuchsia-400"
                      : "bg-white/35"
                  }`}
                  style={{
                    width: `${Math.max(3, Math.round((row.value / max) * 100))}%`,
                    transformOrigin: "left",
                    animation: `aBarGrow 0.55s cubic-bezier(0.2, 0.8, 0.3, 1) ${index * 80}ms both`,
                  }}
                />
              </div>
              {row.sub ? (
                <div className="mt-0.5 text-[9px] tabular-nums text-emerald-300/70">{row.sub}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Single race bar — our points vs the chase target's points
function ProgressCard({ card }: { card: Extract<AssistantCardData, { type: "progress" }> }) {
  const pct = card.target > 0 ? Math.min(99, Math.round((card.current / card.target) * 100)) : 0;
  return (
    <div className="px-2.5 pb-2.5">
      <CardTitle>{card.title}</CardTitle>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px]">
        <CountUpValue value={card.current} className="tabular-nums text-violet-200" />
        <span className="tabular-nums text-white/45">{fmt(card.target)} 🏁</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
          style={{
            width: `${Math.max(3, pct)}%`,
            transformOrigin: "left",
            animation: "aBarGrow 0.6s cubic-bezier(0.2, 0.8, 0.3, 1) 0.05s both",
          }}
        />
      </div>
      {card.sub ? <div className="mt-1 text-[9.5px] text-white/50">{card.sub}</div> : null}
    </div>
  );
}

// Reward tier ladder with "you are here" highlight
function TiersCard({ card }: { card: Extract<AssistantCardData, { type: "tiers" }> }) {
  return (
    <div className="pb-2">
      <CardTitle>{card.title}</CardTitle>
      {card.headline ? (
        <div className="mt-1.5 px-2.5 text-[10.5px] font-semibold text-amber-200/90">{card.headline}</div>
      ) : null}
      <div className="mt-1 space-y-1 px-2.5">
        {card.rows.map((row, index) => {
          const ours = card.currentRank >= row.best && card.currentRank <= row.worst;
          const range = row.best === row.worst ? `#${row.best}` : `#${row.best}–#${row.worst}`;
          return (
            <div
              key={index}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[10.5px] ${
                ours
                  ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                  : "border-white/5 text-white/65"
              }`}
              style={{
                animation: "aCardIn 0.28s ease-out both",
                animationDelay: `${index * 50}ms`,
              }}
            >
              <span className="shrink-0 tabular-nums text-white/45">{range}</span>
              <span className="min-w-0 flex-1 truncate text-right">{row.label}</span>
              {ours ? (
                <span className="shrink-0 rounded-full bg-violet-400/20 px-1.5 text-[8.5px] font-semibold uppercase tracking-wide text-violet-200">
                  us
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {card.sub ? (
        <div className="mt-1.5 px-2.5 text-[9.5px] tabular-nums text-amber-200/70">{card.sub}</div>
      ) : null}
    </div>
  );
}

export default function AssistantCard({ card }: { card: AssistantCardData }) {
  return (
    <div
      className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
      style={{ animation: "aCardIn 0.3s ease-out 0.08s both" }}
    >
      {card.type === "bars" ? <BarsCard card={card} /> : null}
      {card.type === "progress" ? <ProgressCard card={card} /> : null}
      {card.type === "tiers" ? <TiersCard card={card} /> : null}
    </div>
  );
}
