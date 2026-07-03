"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";
import Podium from "@/components/Podium";

type LeaderboardEntry = {
  user_id: number;
  name: string;
  points: number;
  rank: number;
  avatar: string | null;
};

type EventItem = {
  id: string;
  text: string;
  type: "points" | "rankup" | "rankdown" | "crown";
};

type LeaderboardResponse = {
  success: boolean;
  active?: boolean;
  title?: string;
  total_points?: number;
  updatedAt?: string;
  data: LeaderboardEntry[];
  error?: string;
};

type RequirementBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "bullet"; text: string }
  | { type: "quote"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "spacer" };

const BANNER_KEY = "mcwv_home_banner";
const BANNER_SPEED_KEY = "mcwv_home_banner_speed";
const DISCORD_KEY = "mcwv_home_discord_link";
const REQUIREMENTS_KEY = "mcwv_home_requirements_text";

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-GB").format(n);
}

function formatAgo(timestamp: string | null, nowMs: number) {
  if (!timestamp) return "—";
  const diff = Math.max(0, nowMs - new Date(timestamp).getTime());

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function useStoredString(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    const read = () => {
      try {
        const stored = window.localStorage.getItem(key);
        setValue(stored && stored.trim() ? stored : fallback);
      } catch {
        setValue(fallback);
      }
    };

    read();

    const onStorage = (event: StorageEvent) => {
      if (event.key === key) read();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, fallback]);

  return value;
}

function parseRequirementBlocks(input: string): RequirementBlock[] {
  const blocks: RequirementBlock[] = [];
  const lines = input.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      blocks.push({ type: "spacer" });
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "heading3", text: line.slice(4).trim() });
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "heading2", text: line.slice(3).trim() });
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push({ type: "heading1", text: line.slice(2).trim() });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push({ type: "bullet", text: line.slice(2).trim() });
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push({ type: "quote", text: line.slice(2).trim() });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  return blocks;
}

function makeIdleActivity(active: boolean): EventItem[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "points",
      text: active
        ? "⏳ War is active. Waiting for the first live update..."
        : "🕒 No active war right now. The feed will wake up when the next battle starts.",
    },
  ];
}

function buildSeedEvents(players: LeaderboardEntry[]): EventItem[] {
  if (!players.length) return makeIdleActivity(false);

  const items: EventItem[] = [
    {
      id: crypto.randomUUID(),
      type: "points",
      text: `✅ Tracking ${players.length} live players`,
    },
    {
      id: crypto.randomUUID(),
      type: "crown",
      text: `👑 Current leader: ${players[0].name} with ${formatNumber(players[0].points)} points`,
    },
  ];

  players.slice(0, 3).forEach((player) => {
    items.push({
      id: crypto.randomUUID(),
      type: "points",
      text: `#${player.rank} ${player.name} — ${formatNumber(player.points)} points`,
    });
  });

  return items.slice(0, 8);
}

function generateEvents(prev: LeaderboardEntry[], next: LeaderboardEntry[]) {
  const events: EventItem[] = [];
  const prevMap = new Map(prev.map((entry) => [entry.user_id, entry]));

  next.forEach((entry) => {
    const old = prevMap.get(entry.user_id);
    if (!old) return;

    const diff = entry.points - old.points;

    if (diff > 0) {
      events.push({
        id: crypto.randomUUID(),
        type: "points",
        text: `🔥 ${entry.name} +${formatNumber(diff)} points`,
      });
    }

    if (old.rank && entry.rank < old.rank) {
      events.push({
        id: crypto.randomUUID(),
        type: "rankup",
        text: `📈 ${entry.name} moved to #${entry.rank}`,
      });
    }

    if (old.rank && entry.rank > old.rank) {
      events.push({
        id: crypto.randomUUID(),
        type: "rankdown",
        text: `📉 ${entry.name} dropped to #${entry.rank}`,
      });
    }

    if (entry.rank === 1 && old.rank !== 1) {
      events.push({
        id: crypto.randomUUID(),
        type: "crown",
        text: `👑 NEW LEADER: ${entry.name}`,
      });
    }
  });

  return events;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border p-5 backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: accent ?? "var(--primary)" }}
      />
      <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-2 text-sm text-zinc-400">{sub}</p>}
    </div>
  );
}

function InfoPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className="rounded-3xl border p-6 backdrop-blur"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function feedAccent(type: EventItem["type"]) {
  switch (type) {
    case "crown":
      return {
        border: "rgba(250, 204, 21, 0.35)",
        dot: "bg-yellow-300",
      };
    case "rankup":
      return {
        border: "rgba(96, 165, 250, 0.35)",
        dot: "bg-sky-300",
      };
    case "rankdown":
      return {
        border: "rgba(251, 146, 60, 0.35)",
        dot: "bg-orange-300",
      };
    default:
      return {
        border: "rgba(52, 211, 153, 0.30)",
        dot: "bg-emerald-300",
      };
  }
}

function RequirementRenderer({ text }: { text: string }) {
  const blocks = useMemo(() => parseRequirementBlocks(text), [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "spacer") {
          return <div key={index} className="h-1" />;
        }

        if (block.type === "heading1") {
          return (
            <h3 key={index} className="text-xl font-bold text-white">
              {block.text}
            </h3>
          );
        }

        if (block.type === "heading2") {
          return (
            <h4 key={index} className="text-base font-semibold text-zinc-100">
              {block.text}
            </h4>
          );
        }

        if (block.type === "heading3") {
          return (
            <p key={index} className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
              {block.text}
            </p>
          );
        }

        if (block.type === "bullet") {
          return (
            <div key={index} className="flex items-start gap-3 text-sm text-zinc-300">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--primary)" }}
              />
              <span>{block.text}</span>
            </div>
          );
        }

        if (block.type === "quote") {
          return (
            <div
              key={index}
              className="rounded-2xl border-l-4 px-4 py-3 text-sm text-zinc-300"
              style={{
                borderColor: "var(--primary)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {block.text}
            </div>
          );
        }

        return (
          <p key={index} className="text-sm text-zinc-300">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<EventItem[]>([]);
  const [active, setActive] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const prevRef = useRef<LeaderboardEntry[]>([]);

  const bannerText = useStoredString(
    BANNER_KEY,
    "Recruiting now!! Join the Discord and help push us to the top."
  );
  const bannerSpeedRaw = useStoredString(BANNER_SPEED_KEY, "18");
  const discordLink = useStoredString(DISCORD_KEY, "");
  const requirementsText = useStoredString(
    REQUIREMENTS_KEY,
    "## Clan requirements\n- Be respectful\n- Stay active in wars\n- Join the Discord when you can."
  );

  const bannerSpeed = Math.min(40, Math.max(8, toNumber(bannerSpeedRaw) || 18));
  const requirementBlocks = useMemo(
    () => parseRequirementBlocks(requirementsText),
    [requirementsText]
  );

  const hasDiscordLink = useMemo(() => {
    const trimmed = discordLink.trim();
    return /^https?:\/\//i.test(trimmed);
  }, [discordLink]);

  const discordHref = hasDiscordLink ? discordLink.trim() : "/settings";
  const discordLabel = hasDiscordLink ? "Open Discord" : "Set Discord link in Settings";
  const livePlayers = players.length;
  const statusLabel = active ? "LIVE" : "IDLE";
  const trackingLabel = active ? "ACTIVE" : "PAUSED";
  const currentLeader = players[0];
  const syncedLabel = formatAgo(lastSyncedAt, now);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) return;

        const data: LeaderboardResponse = await res.json();
        const next: LeaderboardEntry[] = Array.isArray(data.data) ? data.data : [];
        const isFirstLoad = prevRef.current.length === 0;

        setActive(Boolean(data.active));
        setPlayers(next);
        setTotalPoints(
          toNumber(data.total_points ?? next.reduce((sum, entry) => sum + entry.points, 0))
        );
        setLastSyncedAt(data.updatedAt ?? new Date().toISOString());

        if (!next.length) {
          prevRef.current = [];
          setActivity((prev) => (prev.length ? prev : makeIdleActivity(Boolean(data.active))));
          return;
        }

        const events = isFirstLoad
          ? buildSeedEvents(next)
          : generateEvents(prevRef.current, next);

        prevRef.current = next;

        if (events.length) {
          setActivity((prev) => [...events, ...prev].slice(0, 20));
        } else if (isFirstLoad) {
          setActivity(buildSeedEvents(next));
        }
      } catch {
        // keep last known state
      }
    }

    load();
    const interval = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, []);

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-theme text-theme"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-10">
          <div
            className="overflow-hidden rounded-2xl border"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="flex w-max items-center whitespace-nowrap py-2 text-xs font-semibold uppercase tracking-[0.25em]"
              style={{
                color: "var(--primary)",
                animation: `mcwv-marquee ${bannerSpeed}s linear infinite`,
              }}
            >
              <div className="flex shrink-0 items-center gap-8 pr-8">
                <span>{bannerText}</span>
                <span className="opacity-70">•</span>
                <span>{bannerText}</span>
                <span className="opacity-70">•</span>
                <span>{bannerText}</span>
              </div>
              <div className="flex shrink-0 items-center gap-8 pr-8">
                <span>{bannerText}</span>
                <span className="opacity-70">•</span>
                <span>{bannerText}</span>
                <span className="opacity-70">•</span>
                <span>{bannerText}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.25fr_0.75fr] lg:px-10 lg:py-10">
          <div className="space-y-6">
            <div
              className="rounded-3xl border p-6 backdrop-blur sm:p-8"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "rgba(52, 211, 153, 0.10)",
                  border: "1px solid rgba(52, 211, 153, 0.22)",
                  color: "var(--primary)",
                }}
              >
                <span
                  className="h-2 w-2 animate-pulse rounded-full"
                  style={{ background: "var(--primary)" }}
                />
                {active ? "Tracking active" : "Waiting for the next battle"}
              </div>

              <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
                MCWV Hub
              </h1>

              <p className="mt-4 max-w-2xl text-base text-zinc-300 sm:text-lg">
                Real-time leaderboard tracking, war stats, clan performance analytics,
                and live updates that actually feel alive.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="/leaderboard"
                  className="rounded-2xl px-6 py-3 text-sm font-semibold transition hover:opacity-90"
                  style={{
                    background: "var(--primary)",
                    color: "#000",
                  }}
                >
                  View Leaderboard
                </a>

                <a
                  href="/contributions"
                  className="rounded-2xl px-6 py-3 text-sm font-semibold transition hover:opacity-90"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  Open Contributions
                </a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Live Players"
                value={formatNumber(livePlayers)}
                sub="Full current battle roster"
                accent="linear-gradient(90deg, rgba(52,211,153,0.95), rgba(34,197,94,0.55))"
              />
              <StatCard
                label="System Status"
                value={statusLabel}
                sub={active ? "Connected to live battle data" : "Waiting for battle start"}
                accent="linear-gradient(90deg, rgba(52,211,153,0.95), rgba(59,130,246,0.45))"
              />
              <StatCard
                label="Tracking"
                value={trackingLabel}
                sub={active ? "Updating every 10 seconds" : "Paused until war goes live"}
                accent="linear-gradient(90deg, rgba(96,165,250,0.95), rgba(167,139,250,0.45))"
              />
              <StatCard
                label="Total Points"
                value={formatNumber(totalPoints)}
                sub={`Last sync ${syncedLabel}`}
                accent="linear-gradient(90deg, rgba(250,204,21,0.95), rgba(251,146,60,0.55))"
              />
            </div>
          </div>

          <div className="space-y-4">
            <InfoPanel
              title="System Snapshot"
              action={
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: "rgba(52,211,153,0.10)",
                    color: "var(--primary)",
                    border: "1px solid rgba(52,211,153,0.20)",
                  }}
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                  {active ? "LIVE" : "IDLE"}
                </span>
              }
            >
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Current leader</span>
                  <span className="font-semibold text-white">
                    {currentLeader
                      ? currentLeader.name
                      : active
                      ? "Waiting for updates"
                      : "No active war"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Players tracked</span>
                  <span className="font-semibold text-white">
                    {formatNumber(livePlayers)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Last synced</span>
                  <span className="font-semibold text-white">{syncedLabel}</span>
                </div>
              </div>
            </InfoPanel>

            <InfoPanel title="Clan Discord">
              <div className="space-y-4 text-sm">
                <p className="text-zinc-300">
                  Keep everyone in the same place with the clan Discord. Update the link
                  in Settings whenever it changes.
                </p>

                <a
                  href={discordHref}
                  className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition hover:opacity-90"
                  style={{
                    background: "var(--primary)",
                    color: "#000",
                  }}
                >
                  {discordLabel}
                </a>

                {!hasDiscordLink && (
                  <p className="text-xs text-zinc-400">
                    Add your Discord invite link in Settings to make this button open the
                    server directly.
                  </p>
                )}
              </div>
            </InfoPanel>

            <InfoPanel title="Clan Requirements">
              <RequirementRenderer text={requirementsText} />
            </InfoPanel>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10">
          <Podium players={players} />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:px-10">
          <InfoPanel
            title="Live Activity Feed"
            action={
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  color: "var(--primary)",
                  background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.18)",
                }}
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                LIVE
              </span>
            }
          >
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {activity.length === 0 ? (
                <p className="py-6 text-sm text-zinc-400">
                  Waiting for live activity...
                </p>
              ) : (
                activity.map((item, index) => {
                  const accent = feedAccent(item.type);

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition"
                      style={{
                        background:
                          index === 0
                            ? "rgba(255,255,255,0.05)"
                            : "rgba(255,255,255,0.02)",
                        borderColor: accent.border,
                      }}
                    >
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`}
                      />
                      <div className="flex-1 text-zinc-200">{item.text}</div>
                    </div>
                  );
                })
              )}
            </div>
          </InfoPanel>
        </section>
      </div>

      <style jsx global>{`
        @keyframes mcwv-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </main>
  );
}
