"use client";

import { useEffect, useState } from "react";

type WidgetData = {
  success: boolean;
  serverName?: string;
  inviteUrl?: string | null;
  onlineCount?: number;
  totalMembers?: number | null;
  error?: string;
};

function formatCount(n: number | null | undefined) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat("en-GB").format(n);
}

export default function DiscordWidget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/discord-widget", { cache: "no-store" });
        if (!res.ok) {
          if (active) setLoading(false);
          return;
        }
        const json = await res.json();
        if (active) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  // ---------- Loading skeleton ----------
  if (loading) {
    return (
      <div
        className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border p-4 sm:p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex-1">
            <div className="h-4 w-36 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="mt-2 h-3 w-24 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        </div>
      </div>
    );
  }

  const online = data?.onlineCount ?? 0;
  const total = data?.totalMembers ?? null;
  const invite = data?.inviteUrl ?? null;
  const name = data?.serverName ?? "MCWV Discord";

  // ---------- Error state ----------
  if (!data?.success) {
    return (
      <div
        className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border p-4 text-center sm:p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-2xl"
          style={{ background: "linear-gradient(135deg, #5865F2, #7c3aed)", boxShadow: "0 0 20px rgba(88,101,242,0.35)" }}>
          ⚔️
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          {data?.error ?? "Couldn't load the Discord widget right now."}
        </p>
        {invite && (
          <a href={invite} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-block rounded-xl px-4 py-2 text-sm font-semibold transition hover:scale-[1.02]"
            style={{ background: "var(--primary)", color: "#000" }}>
            Join Discord →
          </a>
        )}
      </div>
    );
  }

  // ---------- Main compact card ----------
  return (
    <div
      className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border"
      style={{
        background: "color-mix(in srgb, var(--card) 88%, #5865F2 5%)",
        borderColor: "color-mix(in srgb, var(--border) 65%, rgba(88,101,242,0.2))",
      }}
    >
      {/* Top accent line */}
      <div
        className="h-1"
        style={{ background: "linear-gradient(90deg, #5865F2, var(--accent), #5865F2)" }}
      />

      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-5 sm:py-5">
        {/* Logo badge */}
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black sm:h-14 sm:w-14 sm:text-2xl"
          style={{
            background: "linear-gradient(135deg, #5865F2, #7c3aed)",
            boxShadow: "0 0 20px rgba(88,101,242,0.35)",
          }}
        >
          ⚔️
        </div>

        {/* Server info */}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white sm:text-base">{name}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {formatCount(online) ?? "—"} online
            </span>
            {total !== null && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
                {formatCount(total)} members
              </span>
            )}
          </div>
        </div>

        {/* Join button: full-width second row on phones, inline on larger screens. */}
        {invite && (
          <a
            href={invite}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 w-full rounded-xl px-4 py-2.5 text-center text-sm font-bold transition hover:scale-[1.02] active:scale-95 sm:col-span-1 sm:w-auto sm:shrink-0 sm:hover:scale-[1.04]"
            style={{
              background: "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #5865F2))",
              color: "#000",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 30%, transparent)",
            }}
          >
            Join
          </a>
        )}
      </div>
    </div>
  );
}

