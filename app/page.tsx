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
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("__") && token.endsWith("__")) {
      nodes.push(
        <u key={`u-${key++}`} className="decoration-yellow-300/70 underline-offset-2">
          {token.slice(2, -2)}
        </u>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`i-${key++}`} className="italic text-white/95">
          {token.slice(1, -1)}
        </em>
      );
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
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
      type: "join",
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
        id: crypto.randomUUID(),
        type: "join",
        text: `🎉 ${entry.name} joined the live roster`,
      });
      return;
    }

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

// CountUp - uses ref to avoid infinite re-renders
function CountUp({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const start = previous.current;
    const end = value;
    previous.current = value;

    const duration = 1500;
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

// Animated wrapper - single source of truth
function Animated({ children, delay = "0ms" }: { children: React.ReactNode; delay?: string }) {
  return (
    <div className="animate-fade-in" style={{ animationDelay: delay }}>
      {children}
    </div>
  );
}

// Panel component
function Panel({
  title,
  children,
  action,
  delay = "0ms",
}: { title: string; children: React.ReactNode; action?: React.ReactNode; delay?: string }) {
  return (
    <Animated delay={delay}>
      <section className="rounded-3xl border p-4 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">{title}</h2>
          {action}
        </div>
        {children}
      </section>
    </Animated>
  );
}

// StatCard component
function StatCard({
  label,
  value,
  sub,
  animate = false,
  numericValue,
  delay = "0ms",
  accent,
}: { label: string; value: string | number; sub?: string; animate?: boolean; numericValue?: number; delay?: string; accent?: string }) {
  return (
    <Animated delay={delay}>
      <div className="relative overflow-hidden rounded-3xl border p-5 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent ?? "var(--primary)" }} />
        <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">{label}</p>
        <p className="mt-3 text-3xl font-bold text-white">
          {animate && numericValue !== undefined ? <CountUp value={numericValue} formatter={formatNumber} /> : value}
        </p>
        {sub && <p className="mt-2 text-sm text-zinc-400">{sub}</p>}
      </div>
    </Animated>
  );
}

function InfoPanel({ title, children, action, delay = "0ms" }: { title: string; children: React.ReactNode; action?: React.ReactNode; delay?: string }) {
  return (
    <Animated delay={delay}>
      <section className="rounded-3xl border p-6 backdrop-blur" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {action}
        </div>
        {children}
      </section>
    </Animated>
  );
}

function feedAccent(type: EventItem["type"]) {
  switch (type) {
    case "crown": return { border: "rgba(250, 204, 21, 0.35)", dot: "bg-yellow-300" };
    case "rankup": return { border: "rgba(96, 165, 250, 0.35)", dot: "bg-sky-300" };
    case "rankdown": return { border: "rgba(251, 146, 60, 0.35)", dot: "bg-orange-300" };
    case "join": return { border: "rgba(52, 211, 153, 0.30)", dot: "bg-emerald-300" };
    default: return { border: "rgba(52, 211, 153, 0.30)", dot: "bg-emerald-300" };
  }
}

function RequirementRenderer({ text }: { text: string }) {
  const blocks = useMemo(() => parseRequirementBlocks(text), [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const delay = `${Math.min(index * 0.05, 0.3)}s`;
        if (block.type === "spacer") {
          return <div key={index} className="h-1 animate-fade-in" style={{ animationDelay: delay }} />;
        }
        if (block.type === "heading1") {
          return <Animated key={index} delay={delay}><h3 className="text-xl font-bold text-white">{renderInlineFormatting(block.text)}</h3></Animated>;
        }
        if (block.type === "heading2") {
          return <Animated key={index} delay={delay}><h4 className="text-base font-semibold text-zinc-100">{renderInlineFormatting(block.text)}</h4></Animated>;
        }
        if (block.type === "heading3") {
          return <Animated key={index} delay={delay}><p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">{renderInlineFormatting(block.text)}</p></Animated>;
        }
        if (block.type === "bullet") {
          return <Animated key={index} delay={delay}><div className="flex items-start gap-3 text-sm text-zinc-300"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--primary)" }} /><span>{renderInlineFormatting(block.text)}</span></div></Animated>;
        }
        if (block.type === "quote") {
          return <Animated key={index} delay={delay}><div className="rounded-2xl border-l-4 px-4 py-3 text-sm text-zinc-300" style={{ borderColor: "var(--primary)", background: "rgba(255,255,255,0.03)" }}>{renderInlineFormatting(block.text)}</div></Animated>;
        }
        return <Animated key={index} delay={delay}><p className="text-sm text-zinc-300">{renderInlineFormatting(block.text)}</p></Animated>;
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
        setGlobal({ discord_link: data.discord_link ?? "", requirements_text: data.requirements_text ?? "", banner_text: data.banner_text ?? "", banner_speed: data.banner_speed ?? 18 });
      } catch { /* keep defaults */ }
    }
    loadGlobal();
  }, []);

  const bannerText = global.banner_text;
  const bannerSpeed = Math.min(40, Math.max(8, toNumber(global.banner_speed) || 18));
  const discordLink = global.discord_link;
  const requirementsText = global.requirements_text;

  const hasDiscordLink = useMemo(() => /^https?:\/\//i.test(discordLink.trim()), [discordLink]);
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
        setTotalPoints(toNumber(data.total_points ?? next.reduce((sum, entry) => sum + entry.points, 0)));
        setLastSyncedAt(data.updatedAt ?? new Date().toISOString());

        if (!next.length) {
          prevRef.current = [];
          setActivity(prev => prev.length ? prev : makeIdleActivity(Boolean(data.active)));
          return;
        }

        const events = isFirstLoad ? buildSeedEvents(next) : generateEvents(prevRef.current, next);
        prevRef.current = next;
        if (events.length) setActivity(prev => [...events, ...prev].slice(0, 20));
        else if (isFirstLoad) setActivity(buildSeedEvents(next));
      } catch { /* keep last known state */ }
    }

    load();
    const interval = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(interval); clearInterval(clock); };
  }, []);

  const pillStyle = { background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)", color: "var(--primary)" } as const;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-theme text-theme" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden"><AnimatedBackground /></div>
      <div className="relative z-10">
        <Navbar />
        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-10">
          <div className="overflow-hidden rounded-2xl border" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03))", borderColor: "var(--border)", animation: "fadeInUp 0.5s ease-out forwards", opacity: 0 }}>
            <div className="flex w-max items-center whitespace-nowrap py-2 text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--primary)", animation: `mcwv-marquee ${bannerSpeed}s linear infinite` }}>
              <div className="flex shrink-0 items-center gap-8 pr-8"><span>{bannerText}</span><span className="opacity-70">•</span><span>{bannerText}</span><span className="opacity-70">•</span><span>{bannerText}</span></div>
              <div className="flex shrink-0 items-center gap-8 pr-8"><span>{bannerText}</span><span className="opacity-70">•</span><span>{bannerText}</span><span className="opacity-70">•</span><span>{bannerText}</span></div>
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:px-10 lg:py-10">
          <div className="space-y-6">
            <Animated delay="0.05s">
              <div className="rounded-3xl border p-6 backdrop-blur sm:p-8" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))", borderColor: "var(--border)" }}>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={pillStyle}><span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--primary)" }} />{active ? "Tracking active" : "Waiting for the next battle"}</div>
                <Animated delay="0.1s"><h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">MCWV Hub</h1></Animated>
                <Animated delay="0.15s"><p className="mt-4 max-w-2xl text-base text-zinc-300 sm:text-lg">Real-time leaderboard tracking, war stats, clan performance analytics, and live updates that actually feel alive.</p></Animated>
                <Animated delay="0.2s"><div className="mt-6 flex flex-wrap gap-3"><a href="/leaderboard" className="rounded-2xl px-6 py-3 text-sm font-semibold transition hover:opacity-90 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]" style={{ background: "var(--primary)", color: "#000" }}>View Leaderboard</a><a href="/contributions" className="rounded-2xl px-6 py-3 text-sm font-semibold transition hover:opacity-90 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--foreground)" }}>Open Contributions</a></div></Animated>
              </div>
            </Animated>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Live Players" value={formatNumber(livePlayers)} sub="Full current battle roster" accent="linear-gradient(90deg, rgba(52,211,153,0.95), rgba(34,197,94,0.55))" animate numericValue={livePlayers} delay="0.1s" />
              <StatCard label="System Status" value={statusLabel} sub={active ? "Connected to live battle data" : "Waiting for battle start"} accent="linear-gradient(90deg, rgba(52,211,153,0.95), rgba(59,130,246,0.45))" delay="0.15s" />
              <StatCard label="Tracking" value={trackingLabel} sub={active ? "Updating every 10 seconds" : "Paused until war goes live"} accent="linear-gradient(90deg, rgba(96,165,250,0.95), rgba(167,139,250,0.45))" delay="0.2s" />
              <StatCard label="Total Points" value={formatNumber(totalPoints)} sub={`Last sync ${syncedLabel}`} accent="linear-gradient(90deg, rgba(250,204,21,0.95), rgba(251,146,60,0.55))" animate numericValue={totalPoints} delay="0.25s" />
            </div>
            <InfoPanel title="Live Activity Feed" action={<span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={pillStyle}><span className="h-2 w-2 animate-pulse rounded-full bg-current" />LIVE</span>} delay="0.2s">
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {activity.length === 0 ? <p className="py-6 text-sm text-zinc-400 animate-fade-in">Waiting for live activity...</p> : activity.map((item, index) => {
                  const accent = feedAccent(item.type);
                  const isNew = index === 0;
                  return (
                    <Animated key={item.id} delay={`${Math.min(index * 0.05, 0.5)}s`}>
                      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)] ${isNew ? "ring-1 ring-yellow-300/30 feed-pop" : ""}`} style={{ background: index === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)", borderColor: accent.border }}>
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`} />
                        <div className="flex-1 text-zinc-200">{item.text}</div>
                      </div>
                    </Animated>
                  );
                })}
              </div>
            </InfoPanel>
          </div>
          <div className="space-y-4">
            <InfoPanel title="Join MCWV Discord" delay="0.3s">
              <a href={discordHref} className="inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]" style={{ background: "var(--primary)", color: "#000" }}>{discordLabel}</a>
              {!hasDiscordLink && <Animated delay="0.35s"><p className="mt-3 text-xs text-zinc-400">Add your Discord invite link in Settings.</p></Animated>}
            </InfoPanel>
            <InfoPanel title="Clan Requirements" delay="0.35s"><RequirementRenderer text={requirementsText} /></InfoPanel>
          </div>
        </section>
        <Animated delay="0.4s"><section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10"><Podium players={players} /></section></Animated>
        <Animated delay="0.45s"><section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-2 lg:px-10"><HallOfFamePreview /><AchievementsPreview /></section></Animated>
      </div>
      <style jsx global>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes feedPop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes mcwv-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes gradientMove { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-fade-in { opacity: 0; animation: fadeInUp .5s ease-out forwards; }
        .feed-pop { animation: feedPop .4s ease-out forwards; }
        .animate-gradientMove { animation: gradientMove 3s ease infinite; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
      `}</style>
    </main>
  );
}
