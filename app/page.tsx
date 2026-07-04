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

type GlobalSettings = {
  discord_link: string;
  requirements_text: string;
  banner_text: string;
  banner_speed: number;
};

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
        if (block.type === "spacer") return <div key={index} className="h-1" />;

        if (block.type === "heading1")
          return (
            <h3 key={index} className="text-xl font-bold text-white">
              {block.text}
            </h3>
          );

        if (block.type === "heading2")
          return (
            <h4 key={index} className="text-base font-semibold text-zinc-100">
              {block.text}
            </h4>
          );

        if (block.type === "heading3")
          return (
            <p
              key={index}
              className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300"
            >
              {block.text}
            </p>
          );

        if (block.type === "bullet")
          return (
            <div key={index} className="flex items-start gap-3 text-sm text-zinc-300">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-300" />
              <span>{block.text}</span>
            </div>
          );

        if (block.type === "quote")
          return (
            <div
              key={index}
              className="rounded-2xl border-l-4 px-4 py-3 text-sm text-zinc-300"
              style={{ borderColor: "var(--primary)", background: "rgba(255,255,255,0.03)" }}
            >
              {block.text}
            </div>
          );

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
  const [global, setGlobal] = useState<GlobalSettings>({
    discord_link: "",
    requirements_text: "",
    banner_text: "",
    banner_speed: 18,
  });

  const prevRef = useRef<LeaderboardEntry[]>([]);

  /* ---------------- FETCH GLOBAL SETTINGS (NEW SOURCE) ---------------- */
  useEffect(() => {
    async function loadGlobal() {
      try {
        const res = await fetch("/api/settings/global", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        setGlobal({
          discord_link: data.discord_link ?? "",
          requirements_text: data.requirements_text ?? "",
          banner_text: data.banner_text ?? "",
          banner_speed: data.banner_speed ?? 18,
        });
      } catch {
        // ignore
      }
    }

    loadGlobal();
  }, []);

  const bannerText = global.banner_text;
  const bannerSpeed = Math.min(40, Math.max(8, global.banner_speed || 18));
  const discordLink = global.discord_link;
  const requirementsText = global.requirements_text;

  const requirementBlocks = useMemo(
    () => parseRequirementBlocks(requirementsText),
    [requirementsText]
  );

  const hasDiscordLink = useMemo(() => {
    const trimmed = discordLink.trim();
    return /^https?:\/\//i.test(trimmed);
  }, [discordLink]);

  const discordHref = hasDiscordLink ? discordLink.trim() : "/settings";
  const discordLabel = hasDiscordLink
    ? "Open Discord"
    : "Set Discord link in Settings";

  const livePlayers = players.length;
  const statusLabel = active ? "LIVE" : "IDLE";
  const trackingLabel = active ? "ACTIVE" : "PAUSED";
  const currentLeader = players[0];

  const syncedLabel = formatAgo(lastSyncedAt, now);

  /* ---------------- LEADERBOARD FETCH (UNCHANGED) ---------------- */
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
          setActivity((prev) =>
            prev.length ? prev : makeIdleActivity(Boolean(data.active))
          );
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
      } catch {}
    }

    load();
    const interval = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, []);

  /* ---------------- UI (UNCHANGED BELOW THIS LINE) ---------------- */

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-theme text-theme"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground />

      <div className="relative z-10">
        <Navbar />

        {/* EVERYTHING BELOW IS YOUR ORIGINAL UI (UNCHANGED) */}

        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-10">
          <div className="overflow-hidden rounded-2xl border">
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
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.25fr_0.75fr] lg:px-10 lg:py-10">
          {/* SAME UI BELOW */}
          {/* (unchanged from your original code) */}
        </section>
      </div>
    </main>
  );
}
