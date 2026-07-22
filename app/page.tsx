"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";
import Podium from "@/components/Podium";
import HallOfFamePreview from "@/components/HallOfFamePreview";
import AchievementsPreview from "@/components/AchievementsPreview";

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
  type: "points" | "rankup" | "rankdown" | "crown" | "join";
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

type GlobalSettings = {
  discord_link: string;
  requirements_text: string;
  banner_text: string;
  banner_speed: number;
};

type RequirementBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "bullet"; text: string }
  | { type: "quote"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "spacer" };

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function renderInlineFormatting(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*.+?\*\*|__.+?__|\*.+?\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("__") && token.endsWith("__")) {
      nodes.push(<u key={key++}>{token.slice(2, -2)}</u>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function makeIdleActivity(active: boolean): EventItem[] {
  return [
    {
      id: createId(),
      type: "join",
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
      id: createId(),
      type: "join",
      text: `✅ Tracking ${players.length} live players`,
    },
    {
      id: createId(),
      type: "crown",
      text: `👑 Current leader: ${players[0].name} with ${formatNumber(players[0].points)} points`,
    },
  ];

  players.slice(0, 3).forEach((player) => {
    items.push({
      id: createId(),
      type: "join",
      text: `• ${player.name} is currently ranked #${player.rank}`,
    });
  });

  return items.slice(0, 8);
}

function generateEvents(prev: LeaderboardEntry[], next: LeaderboardEntry[]) {
  const events: EventItem[] = [];
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

// CountUp component - matches contributions page
function CountUp({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            const start = 0;
            const end = value;
            const duration = 1500;
            const startTime = performance.now();

            const updateValue = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeOutQuart = 1 - Math.pow(1 - progress, 4);
              setDisplayValue(Math.floor(start + (end - start) * easeOutQuart));
              if (progress < 1) requestAnimationFrame(updateValue);
            };

            requestAnimationFrame(updateValue);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{formatter(displayValue)}</span>;
}

// Panel component - matches contributions page
function Panel({
  title,
  children,
  right,
  delay = "0ms",
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  delay?: string;
}) {
  return (
    <section
      className="rounded-3xl border p-4 sm:p-6"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
        opacity: 0,
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// StatCard component - matches contributions page KpiCard
function StatCard({
  title,
  value,
  sub,
  animate = false,
  numericValue,
  delay = "0ms",
}: {
  title: string;
  value: string | number;
  sub?: string;
  animate?: boolean;
  numericValue?: number;
  delay?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
        opacity: 0,
      }}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">{title}</div>
      <div className="mt-2 text-2xl font-bold text-white">
        {animate && numericValue !== undefined ? (
          <CountUp value={numericValue} formatter={formatNumber} />
        ) : (
          value
        )}
      </div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

function feedAccent(type: EventItem["type"]) {
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

function RequirementRenderer({ text }: { text: string }) {
  const blocks = useMemo(() => parseRequirementBlocks(text), [text]);

  return (
    <div>
      {blocks.map((block, index) => {
        if (block.type === "spacer") {
          return <div key={index} />;
        }

        if (block.type === "heading1") {
          return (
            <h3 key={index} className="mt-4 mb-2 text-xl font-bold text-white">
              {renderInlineFormatting(block.text)}
            </h3>
          );
        }

        if (block.type === "heading2") {
          return (
            <h4 key={index} className="mt-3 mb-1 text-lg font-semibold text-white">
              {renderInlineFormatting(block.text)}
            </h4>
          );
        }

        if (block.type === "heading3") {
          return (
            <h5 key={index} className="mt-2 mb-1 text-base font-medium text-white">
              {renderInlineFormatting(block.text)}
            </h5>
          );
        }

        if (block.type === "bullet") {
          return (
            <p key={index} className="ml-4 flex items-center gap-2 text-sm text-zinc-300">
              <span className="text-primary">•</span>
              {renderInlineFormatting(block.text)}
            </p>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote key={index} className="my-2 border-l-4 border-primary/30 pl-4 italic text-zinc-300">
              {renderInlineFormatting(block.text)}
            </blockquote>
          );
        }

        return (
          <p key={index} className="text-sm leading-relaxed text-zinc-300">
            {renderInlineFormatting(block.text)}
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
  const [global, setGlobal] = useState<GlobalSettings>({
    discord_link: "",
    requirements_text: "",
    banner_text: "Recruiting now!! Join the Discord and help push us to the top.",
    banner_speed: 18,
  });

  const prevRef = useRef<LeaderboardEntry[]>([]);

  useEffect(() => {
    async function loadGlobal() {
      try {
        const res = await fetch("/api/settings/global", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setGlobal({
          discord_link: data.discord_link ?? "",
          requirements_text: data.requirements_text ?? "",
          banner_text: data.banner_text ?? "",
          banner_speed: data.banner_speed ?? 18,
        });
      } catch {
        // keep defaults
      }
    }
    loadGlobal();
  }, []);

  const bannerText = global.banner_text;
  const discordLink = global.discord_link;
  const requirementsText = global.requirements_text;

  const hasDiscordLink = useMemo(() => {
    const trimmed = discordLink.trim();
    return /^https?:\/\//i.test(trimmed);
  }, [discordLink]);

  const discordHref = hasDiscordLink ? discordLink.trim() : "/settings";
  const discordLabel = hasDiscordLink ? "Join Discord" : "Set Discord link in Settings";
  const livePlayers = players.length;
  const statusLabel = active ? "LIVE" : "IDLE";
  const trackingLabel = active ? "ACTIVE" : "PAUSED";
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
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div
          className="relative overflow-hidden rounded-[2rem] border"
          style={{
            borderColor: "var(--border)",
            background: "color-mix(in srgb, var(--card) 92%, transparent)",
            animation: "fadeInUp 0.5s ease-out forwards",
            opacity: 0,
          }}
        >
          <div className="absolute inset-0 flex" aria-hidden="true">
            <div
              className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400/70"
              style={{
                transform: "translateX(0)",
                animation: `marquee ${Math.max(8, Math.min(40, toNumber(global.banner_speed) || 18))}s linear infinite`,
              }}
            >
              {bannerText} • {bannerText} • {bannerText} • {bannerText} • {bannerText}
            </div>
          </div>

          <div className="relative flex h-[40px] items-center justify-center px-4 text-sm font-medium uppercase tracking-[0.2em] text-[var(--foreground)]">
            {active ? "Tracking active" : "Waiting for the next battle"}
          </div>
        </div>

        <section
          className="mt-8 rounded-[2rem] border p-6 backdrop-blur sm:p-8"
          style={{
            borderColor: "var(--border)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 88%, transparent))",
            animation: "fadeInUp 0.5s ease-out forwards",
            animationDelay: "0.1s",
            opacity: 0,
          }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                MCWV Hub
              </h1>
              <p className="mt-3 max-w-xl text-zinc-300">
                Real-time leaderboard tracking, war stats, clan performance analytics,
                and live updates that actually feel alive.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/leaderboard"
                className="rounded-2xl border px-5 py-3 font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                View Leaderboard
              </a>
              <a
                href="/contributions"
                className="rounded-2xl border px-5 py-3 font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                Open Contributions
              </a>
            </div>
          </div>
        </section>

        <Panel
          title="Live Status"
          right={<span className="text-xs text-zinc-400">Real-time war tracking</span>}
          delay="0.15s"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Status"
              value={statusLabel}
              sub={`Tracking: ${trackingLabel}`}
              animate
              numericValue={active ? 1 : 0}
              delay="0.2s"
            />
            <StatCard
              title="Live Players"
              value={livePlayers}
              sub="Active roster"
              animate
              numericValue={livePlayers}
              delay="0.25s"
            />
            <StatCard
              title="Total Points"
              value={formatNumber(totalPoints)}
              sub="Clan aggregate"
              animate
              numericValue={totalPoints}
              delay="0.3s"
            />
            <StatCard
              title="Last Sync"
              value={syncedLabel}
              sub="Auto-refreshes every 10s"
              delay="0.35s"
            />
          </div>
        </Panel>

        <Panel
          title="Activity Feed"
          right={<span className="text-xs text-zinc-400">Live updates</span>}
          delay="0.2s"
        >
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {activity.length === 0 ? (
              <div
                className="py-8 text-center text-zinc-400"
                style={{ animation: "fadeInUp 0.5s ease-out forwards" }}
              >
                Waiting for live activity...
              </div>
            ) : (
              activity.map((item, index) => {
                const accent = feedAccent(item.type);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border px-4 py-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                    style={{
                      borderColor: accent.border,
                      background: "rgba(0,0,0,0.14)",
                      animation: "fadeInUp 0.3s ease-out forwards",
                      animationDelay: `${Math.min(index * 0.05, 0.5)}s`,
                      opacity: 0,
                    }}
                  >
                    <p className="text-sm text-white">{item.text}</p>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <div
          className="grid gap-6 lg:grid-cols-[1fr_1.5fr]"
          style={{
            animation: "fadeInUp 0.5s ease-out forwards",
            animationDelay: "0.25s",
            opacity: 0,
          }}
        >
          <Panel
            title="Discord"
            right={<span className="text-xs text-zinc-400">Community link</span>}
            delay="0.3s"
          >
            <div className="space-y-4">
              <a
                href={discordHref}
                target={hasDiscordLink ? "_blank" : undefined}
                rel={hasDiscordLink ? "noopener noreferrer" : undefined}
                className="rounded-2xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.675 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.083.083 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-.474.074.074 0 0 0 .041-.106 13.107 13.107 0 0 0-.529-1.872.077.077 0 0 0-.107-.086 13.414 13.414 0 0 1-1.689-2.47.077.077 0 0 1-.007-.128 10.07 10.07 0 0 1 .387-1.415.073.073 0 0 1 .11-.072 5.792 5.792 0 0 1 .976-.32.077.077 0 0 1 .077.077c0 .19-.026.38-.045.574a7.97 7.97 0 0 1-1.281 2.185.077.077 0 0 0-.005.13 11.44 11.44 0 0 0 .322.973.073.073 0 0 0 .108.036c.147 0 .292-.022.43-.063a12.89 12.89 0 0 0 1.332-.432.077.077 0 0 0 .025-.128 13.55 13.55 0 0 0-.425-2.135.077.077 0 0 0-.105-.082 9.54 9.54 0 0 1-2.468-3.578.077.077 0 0 1-.007-.128c.272-.637.607-1.303.968-1.915a.076.076 0 0 0-.024-.108 19.5 19.5 0 0 1 3.317-2.209.074.074 0 0 0 .035-.053 15.25 15.25 0 0 1 2.664-.66.077.077 0 0 1 .086.037 8.542 8.542 0 0 1 2.143 1.526.072.072 0 0 0 .106 0 8.513 8.513 0 0 1 2.018-1.402.076.076 0 0 0 .018-.126 14.9 14.9 0 0 0-.59-2.236.077.077 0 0 0-.123-.026 16.16 16.16 0 0 0-1.025-.27.075.075 0 0 0-.072.043 13.6 13.6 0 0 1-.745.986.077.077 0 0 1-.129.007 16.53 16.53 0 0 1-4.991 0 .077.077 0 0 1-.129-.007 12.78 12.78 0 0 1-.764-.986.076.076 0 0 0-.072-.042 20.12 20.12 0 0 0-1.02.27.077.077 0 0 0-.126.026c-.3.59-.734 1.243-.975 1.952a.077.077 0 0 0-.028.128 11.75 11.75 0 0 0-.428 2.143.076.076 0 0 0 .026.128 13.17 13.17 0 0 0 1.28.408.072.072 0 0 0 .107 0 8.58 8.58 0 0 1 2.12-1.47.077.077 0 0 0 .034-.135c-.014-.164-.026-.35-.045-.572a.077.077 0 0 1 .077-.077 5.95 5.95 0 0 1 .994.31.072.072 0 0 1 .083.077 9.55 9.55 0 0 1 .355 1.38.074.074 0 0 1-.053.12 10.08 10.08 0 0 1-.37 1.38.077.077 0 0 0 .01.128 12.64 12.64 0 0 1-1.65 2.465.077.077 0 0 0-.106.086 13.62 13.62 0 0 0-.533 1.868.076.076 0 0 0 .044.108 13.02 13.02 0 0 0 1.23.475.074.074 0 0 0 .085.028 19.66 19.66 0 0 0 6.007-3.04.076.076 0 0 0 .03-.058c.383-4.27-.534-8.834-3.589-13.384a.061.061 0 0 0-.03-.027z" />
                    </svg>
                    <span className="font-semibold text-white">{discordLabel}</span>
                  </div>
                  <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </a>

              {!hasDiscordLink && (
                <p className="text-xs text-zinc-400">Add your Discord invite link in Settings.</p>
              )}
            </div>
          </Panel>

          <Panel
            title="Requirements"
            right={<span className="text-xs text-zinc-400">Join criteria</span>}
            delay="0.35s"
          >
            <RequirementRenderer text={requirementsText} />
          </Panel>
        </div>

        <Panel
          title="Top 3"
          right={<span className="text-xs text-zinc-400">Current leaders</span>}
          delay="0.4s"
        >
          <Podium players={players.slice(0, 3)} />
        </Panel>

        <Panel
          title="Hall of Fame"
          right={
            <a href="/hall-of-fame" className="text-xs text-primary hover:underline">
              View all →
            </a>
          }
          delay="0.45s"
        >
          <HallOfFamePreview />
        </Panel>

        <Panel
          title="Recent Achievements"
          right={
            <a href="/achievements" className="text-xs text-primary hover:underline">
              View all →
            </a>
          }
          delay="0.5s"
        >
          <AchievementsPreview />
        </Panel>
      </div>

      <style jsx>{`
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

        @keyframes gradientMove {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .animate-gradientMove {
          animation: gradientMove 3s ease infinite;
        }

        .animate-fade-in {
          animation: fadeInUp 0.5s ease-out forwards;
        }

        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </main>
  );
}
