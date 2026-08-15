"use client";

import type { AssistantCardData } from "@/lib/assistantEngine";

const fmt = (value: number) => Math.round(value).toLocaleString("en-GB");

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
                <span
                  className={`shrink-0 text-[10px] tabular-nums ${
                    row.highlight ? "text-violet-200" : "text-white/50"
                  }`}
                >
                  {fmt(row.value)}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${
                    row.highlight
                      ? "bg-gradient-to-r from-violet-500 to-fuchsia-400"
                      : "bg-white/35"
                  }`}
                  style={{ width: `${Math.max(3, Math.round((row.value / max) * 100))}%` }}
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
        <span className="tabular-nums text-violet-200">{fmt(card.current)}</span>
        <span className="tabular-nums text-white/45">{fmt(card.target)} 🏁</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all"
          style={{ width: `${Math.max(3, pct)}%` }}
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
          const range = row.best === row.worst ? `#${row.best}` : `#${row.best}–${row.worst}`;
          return (
            <div
              key={index}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[10.5px] ${
                ours
                  ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                  : "border-white/5 text-white/65"
              }`}
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
    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      {card.type === "bars" ? <BarsCard card={card} /> : null}
      {card.type === "progress" ? <ProgressCard card={card} /> : null}
      {card.type === "tiers" ? <TiersCard card={card} /> : null}
    </div>
  );
}
