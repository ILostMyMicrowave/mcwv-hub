"use client";

import Navbar from "@/components/Navbar";
import WarHistoryDropdown from "@/components/WarHistoryDropdown";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Animated({ children, delay = "0ms" }: { children: ReactNode; delay?: string }) {
  return (
    <div className="animate-fade-in" style={{ animationDelay: delay }}>
      {children}
    </div>
  );
}

function CountUp({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const start = previous.current;
    const end = value;
    previous.current = value;

    const duration = 1200;
    const startTime = performance.now();

    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{formatter(displayValue)}</span>;
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
      className={`relative rounded-3xl border border-white/10 bg-gradient-to-b ${styles} p-5 shadow-2xl shadow-black/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-black/50 ${className}`}
      style={{ animation: "fadeInUp 0.5s ease-out forwards", opacity: 0 }}
    >
      {place === 1 && (
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-yellow-400/5" />
      )}

      {entry ? (
        <>
          <div className="mb-4 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              {place === 1 && (
                <div className="pointer-events-none absolute -z-10 h-28 w-28 animate-pulse rounded-full bg-yellow-300/20 blur-2xl" />
              )}

              {place === 1 && (
                <div className="pointer-events-none absolute -top-4 animate-bounce text-2xl">
                  👑
                </div>
              )}

              {entry.avatar ? (
                <img
                  src={entry.avatar}
                  alt={entry.name}
                  className={`h-20 w-20 rounded-full object-cover ring-4 ${
                    place === 1 ? "ring-yellow-300/30" : "ring-white/15"
                  }`}
                />
              ) : (
                <div
                  className={`h-20 w-20 rounded-full ring-4 ${
                    place === 1 ? "ring-yellow-300/30" : "ring-white/15"
                  }`}
                >
                  <InitialAvatar name={entry.name} />
                </div>
              )}
            </div>
          </div>

          <div className="text-center">
            <div className="mb-1 text-2xl">{crowns}</div>
            <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
            <p className="mt-1 text-sm text-zinc-300">
              {formatNumber(entry.points)} points
            </p>

            <p className="mt-2 text-xs uppercase tracking-[0.25em]">
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] transition ${
                  entry.discord_id
                    ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20"
                    : "bg-zinc-800/40 text-zinc-400 ring-1 ring-white/10"
                }`}
              >
                {entry.discord_id ? "Discord linked" : "Not linked"}
              </span>
            </p>
          </div>
        </>
      ) : (
        <div className="py-10 text-center text-zinc-500">Waiting for data</div>
      )}
    </div>
  );
}

function Panel({
  title,
  children,
  action,
  delay = "0ms",
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  delay?: string;
}) {
  return (
    <Animated delay={delay}>
      <section
        className="rounded-3xl border p-4 sm:p-6"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
            {title}
          </h2>
          {action}
        </div>
        {children}
      </section>
    </Animated>
  );
}

function feedAccent(type: string) {
  switch (type) {
    case "crown":
      return { border: "rgba(250, 204, 21, 0.35)", dot: "bg-yellow-300" };
    case "rankup":
      return { border: "rgba(96, 165, 250, 0.35)", dot: "bg-sky-300" };
    case "rankdown":
      return { border: "rgba(251, 146, 60, 0.35)", dot: "bg-orange-300" };
    case "join":
      return { border: "rgba(52, 211, 153, 0.30)", dot: "bg-emerald-300" };
    default:
      return { border: "rgba(52, 211, 153, 0.30)", dot: "bg-emerald-300" };
  }
}

function buildSeedEvents(players: LeaderboardEntry[]) {
  if (!players.length) {
    return [
      {
        id: createId(),
        type: "join" as const,
        text: "🕒 No active war right now. The feed will wake up when the next battle starts.",
      },
    ];
  }

  const items = [
    {
      id: createId(),
      type: "join" as const,
      text: `✅ Tracking ${players.length} live players`,
    },
    {
      id: createId(),
      type: "crown" as const,
      text: `👑 Current leader: ${players[0].name} with ${formatNumber(players[0].points)} points`,
    },
  ];

  players.slice(0, 3).forEach((player) => {
    items.push({
      id: createId(),
      type: "join" as const,
      text: `• ${player.name} is currently ranked #${player.rank}`,
    });
  });

  return items.slice(0, 8);
}

function generateEvents(prev: LeaderboardEntry[], next: LeaderboardEntry[]) {
  const events: Array<{ id: string; type: "points" | "rankup" | "rankdown" | "crown" | "join"; text: string }> = [];
  const prevMap = new Map(prev.map((entry) => [entry.user_id, entry]));

  next.forEach((entry) => {
    const old = prevMap.get(entry.user_id);

    if (!old) {
      events.push({
        id: createId(),
        type: "join",
        text: `🎉 ${entry.name} joined the live roster`,
      });
      return;
    }

    const diff = entry.points - old.points;

    if (diff > 0) {
      events.push({
        id: createId(),
        type: "points",
        text: `🔥 ${entry.name} +${formatNumber(diff)} points`,
      });
    }

    if (old.rank && entry.rank < old.rank) {
      events.push({
        id: createId(),
        type: "rankup",
        text: `📈 ${entry.name} moved to #${entry.rank}`,
      });
    }

    if (old.rank && entry.rank > old.rank) {
      events.push({
        id: createId(),
        type: "rankdown",
        text: `📉 ${entry.name} dropped to #${entry.rank}`,
      });
    }

    if (entry.rank === 1 && old.rank !== 1) {
      events.push({
        id: createId(),
        type: "crown",
        text: `👑 NEW LEADER: ${entry.name}`,
      });
    }
  });

  return events;
}

function RequirementRenderer({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const out: Array<
      | { type: "heading1"; text: string }
      | { type: "heading2"; text: string }
      | { type: "heading3"; text: string }
      | { type: "bullet"; text: string }
      | { type: "quote"; text: string }
      | { type: "paragraph"; text: string }
      | { type: "spacer" }
    > = [];

    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        out.push({ type: "spacer" });
        continue;
      }
      if (line.startsWith("### ")) {
        out.push({ type: "heading3", text: line.slice(4).trim() });
        continue;
      }
      if (line.startsWith("## ")) {
        out.push({ type: "heading2", text: line.slice(3).trim() });
        continue;
      }
      if (line.startsWith("# ")) {
        out.push({ type: "heading1", text: line.slice(2).trim() });
        continue;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        out.push({ type: "bullet", text: line.slice(2).trim() });
        continue;
      }
      if (line.startsWith("> ")) {
        out.push({ type: "quote", text: line.slice(2).trim() });
        continue;
      }
      out.push({ type: "paragraph", text: line });
    }

    return out;
  }, [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const delay = `${Math.min(index * 0.05, 0.3)}s`;

        if (block.type === "spacer") {
          return <div key={index} className="h-1 animate-fade-in" style={{ animationDelay: delay }} />;
        }

        if (block.type === "heading1") {
          return (
            <Animated key={index} delay={delay}>
              <h3 className="text-xl font-bold text-white">{block.text}</h3>
            </Animated>
          );
        }

        if (block.type === "heading2") {
          return (
            <Animated key={index} delay={delay}>
              <h4 className="text-base font-semibold text-zinc-100">{block.text}</h4>
            </Animated>
          );
        }

        if (block.type === "heading3") {
          return (
            <Animated key={index} delay={delay}>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
                {block.text}
              </p>
            </Animated>
          );
        }

        if (block.type === "bullet") {
          return (
            <Animated key={index} delay={delay}>
              <div className="flex items-start gap-3 text-sm text-zinc-300">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
                <span>{block.text}</span>
              </div>
            </Animated>
          );
        }

        if (block.type === "quote") {
          return (
            <Animated key={index} delay={delay}>
              <div
                className="rounded-2xl border-l-4 px-4 py-3 text-sm text-zinc-300"
                style={{
                  borderColor: "var(--primary)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {block.text}
              </div>
            </Animated>
          );
        }

        return (
          <Animated key={index} delay={delay}>
            <p className="text-sm text-zinc-300">{block.text}</p>
          </Animated>
        );
      })}
    </div>
  );
}

function LeaderboardRow({
  entry,
  change,
}: {
  entry: LeaderboardEntry;
  change: number;
}) {
  return (
    <a
      href={`/profile?roblox_id=${entry.user_id}`}
      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-black/30"
    >
      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-lg font-bold text-zinc-300">
        #{entry.rank}

        {change > 0 && (
          <span className="absolute -top-2 -right-2 animate-pulse text-xs font-bold text-green-400">
            ▲{change}
          </span>
        )}

        {change < 0 && (
          <span className="absolute -top-2 -right-2 animate-pulse text-xs font-bold text-red-400">
            ▼{Math.abs(change)}
          </span>
        )}
      </div>

      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10">
        {entry.avatar ? (
          <img src={entry.avatar} alt={entry.name} className="h-full w-full object-cover" />
        ) : (
          <InitialAvatar name={entry.name} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold text-white">{entry.name}</h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] transition ${
              entry.discord_id
                ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20"
                : "bg-zinc-800/40 text-zinc-400 ring-1 ring-white/10"
            }`}
          >
            {entry.discord_id ? "Discord linked" : "Not linked"}
          </span>
        </div>

        <p className="truncate text-sm text-zinc-400">Roblox ID: {entry.user_id}</p>
      </div>

      <div className="text-right">
        <div className="text-lg font-bold text-white">{formatNumber(entry.points)}</div>
      </div>
    </a>
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
  const [flash, setFlash] = useState(0);
  const [rankChange, setRankChange] = useState<Record<number, number>>({});
  const [now, setNow] = useState(Date.now());
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Array<{ id: string; type: "points" | "rankup" | "rankdown" | "crown" | "join"; text: string }>>([]);

  const prevSnapshot = useRef<string>("");
  const prevRanksRef = useRef<Record<number, number>>({});
  const prevDataRef = useRef<LeaderboardEntry[]>([]);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (selectedBattleId) params.set("battle_id", selectedBattleId);

      const res = await fetch(`/api/leaderboard?${params.toString()}`, {
        cache: "no-store",
      });
      const json: ApiResponse = await res.json();

      if (!json.success) {
        if (selectedBattleId && json.data?.length === 0) {
          setError(
            "No individual member data available for this historical battle. Data collection started after this war ended."
          );
        } else {
          setError(json.error ?? "Failed to load leaderboard");
        }
        setData([]);
        setTotalPoints(0);
        setLoading(false);
        return;
      }

      const nextData = Array.isArray(json.data) ? json.data : [];
      const nextSnapshot = JSON.stringify(nextData);

      if (prevSnapshot.current && prevSnapshot.current !== nextSnapshot) {
        setFlash((n) => n + 1);
      }

      const nextRanks: Record<number, number> = {};
      const changes: Record<number, number> = {};

      nextData.forEach((entry) => {
        const oldRank = prevRanksRef.current[entry.user_id];
        const newRank = entry.rank;

        if (oldRank !== undefined) {
          changes[entry.user_id] = oldRank - newRank;
        }

        nextRanks[entry.user_id] = newRank;
      });

      const isFirstLoad = prevSnapshot.current.length === 0;
      const activityEvents = isFirstLoad
        ? buildSeedEvents(nextData)
        : generateEvents(prevDataRef.current, nextData);

      if (activityEvents.length) {
        setActivity((prev) => [...activityEvents, ...prev].slice(0, 20));
      } else if (isFirstLoad && activity.length === 0) {
        setActivity(buildSeedEvents(nextData));
      }

      prevSnapshot.current = nextSnapshot;
      prevRanksRef.current = nextRanks;
      prevDataRef.current = nextData;

      setRankChange(changes);
      setData(nextData);
      setTitle(json.title ?? "MCWV Leaderboard");
      setActive(Boolean(json.active));
      setUpdatedAt(new Date().toISOString());
      setTotalPoints(Number(json.total_points ?? 0));
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData([]);
      setTotalPoints(0);
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
  }, [selectedBattleId]);

  const podium = useMemo(() => data.slice(0, 3), [data]);

  const updatedAgo = updatedAt
    ? `${Math.max(1, Math.floor((now - new Date(updatedAt).getTime()) / 1000))}s ago`
    : "—";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black px-4 py-8 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Animated delay="0.05s">
            <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-emerald-400" : "bg-zinc-500"
                      } animate-pulse`}
                    />
                    {active ? "Live war tracking" : "No active war right now"}
                  </div>

                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    {title}
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                    Live updates refresh every 10 seconds. Roblox avatars and Discord-link
                    badges appear automatically when the API provides them.
                  </p>
                </div>

                <div className="flex flex-col items-end gap-4 text-sm text-zinc-400">
                  <div className="flex items-center gap-3">
                    <WarHistoryDropdown
                      selectedBattleId={selectedBattleId}
                      onSelect={setSelectedBattleId}
                    />

                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      LIVE
                    </span>

                    <span className="text-sm text-zinc-300">updated {updatedAgo}</span>
                  </div>

                  <div>
                    Total points:{" "}
                    <span className="font-semibold text-white">
                      <CountUp value={totalPoints} formatter={formatNumber} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Animated>

          {loading ? (
            <Animated delay="0.1s">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
                Loading leaderboard...
              </div>
            </Animated>
          ) : error ? (
            <Animated delay="0.1s">
              <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-200">
                {error}
              </div>
            </Animated>
          ) : (
            <>
              <section className={`mb-16 transition-all duration-500 ${flash ? "scale-[1.01]" : ""}`}>
                <Animated delay="0.1s">
                  <div className="mb-4 text-lg font-semibold text-zinc-100">Top 3 podium</div>
                </Animated>

                <div className="grid gap-4 md:grid-cols-3 md:items-end">
                  <Animated delay="0.15s">
                    <div className="md:order-1 md:translate-y-8">
                      <PodiumCard entry={podium[1]} place={2} />
                    </div>
                  </Animated>

                  <Animated delay="0.2s">
                    <div className="md:order-2 md:-translate-y-2">
                      <PodiumCard entry={podium[0]} place={1} className="md:scale-[1.04]" />
                    </div>
                  </Animated>

                  <Animated delay="0.25s">
                    <div className="md:order-3 md:translate-y-12">
                      <PodiumCard entry={podium[2]} place={3} />
                    </div>
                  </Animated>
                </div>
              </section>

              <Animated delay="0.3s">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Full leaderboard</h2>
                    <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Auto refresh
                    </span>
                  </div>

                  <div className="space-y-3">
                    {data.map((entry) => {
                      const change = rankChange[entry.user_id] ?? 0;

                      return (
                        <Animated key={entry.user_id} delay="0s">
                          <LeaderboardRow entry={entry} change={change} />
                        </Animated>
                      );
                    })}
                  </div>
                </section>
              </Animated>

              <Animated delay="0.35s">
                <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Live activity</h2>
                    <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Animated updates
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activity.length === 0 ? (
                      <p className="py-6 text-sm text-zinc-400">Waiting for live activity...</p>
                    ) : (
                      activity.map((item, index) => {
                        const accent = feedAccent(item.type);
                        const isNew = index === 0;

                        return (
                          <Animated key={item.id} delay={`${Math.min(index * 0.04, 0.4)}s`}>
                            <div
                              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)] ${
                                isNew ? "ring-1 ring-yellow-300/30" : ""
                              }`}
                              style={{
                                background:
                                  index === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                                borderColor: accent.border,
                              }}
                            >
                              <span
                                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`}
                              />
                              <div className="flex-1 text-zinc-200">{item.text}</div>
                            </div>
                          </Animated>
                        );
                      })
                    )}
                  </div>
                </section>
              </Animated>
            </>
          )}
        </div>

        <style jsx global>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes feedPop {
            from {
              opacity: 0;
              transform: scale(0.96);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          .animate-fade-in {
            opacity: 0;
            animation: fadeInUp 0.5s ease-out forwards;
          }

          .feed-pop {
            animation: feedPop 0.4s ease-out forwards;
          }

          @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>
      </main>
    </>
  );
}
