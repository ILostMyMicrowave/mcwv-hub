"use client";

import Navbar from "@/components/Navbar";
import WarHistoryDropdown from "@/components/WarHistoryDropdown";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const dynamic = "force-dynamic";

type ProfileStyle = {
  backgroundUrl: string | null;
  backgroundType: "image" | "gif" | "video" | null;
  backgroundPreset: string;
  accentColor: string;
  framePreset: string;
  framePrimaryColor?: string | null;
  frameSecondaryColor?: string | null;
  frameEmoji?: string | null;
  fontPreset?: string | null;
  bio: string | null;
  badges: string[];
};

type LeaderboardEntry = {
  rank: number;
  user_id: number;
  name: string;
  points: number | null;
  avatar: string | null;
  discord_id: string | null;
  is_alt?: boolean;
  disconnects24h?: number;
  change5m?: number;
  pph?: number;
  style?: ProfileStyle;
};

type CurrentUser = {
  id: number;
  username: string;
  roblox_id?: string | number | null;
  role?: "member" | "officer" | "owner" | string | null;
};

type PlayerHistoryPoint = {
  time: string;
  value: number;
  delta?: number;
};

type PlayerHistory = {
  points: PlayerHistoryPoint[];
  rank: PlayerHistoryPoint[];
  disconnects: PlayerHistoryPoint[];
  disconnects24h: number;
  change5m: number;
  pph: number;
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

function formatPoints(value: number | null | undefined) {
  return typeof value === "number" ? formatNumber(value) : "—";
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

const DEFAULT_STYLE: ProfileStyle = {
  backgroundUrl: null,
  backgroundType: null,
  backgroundPreset: "default",
  accentColor: "#34d399",
  framePreset: "none",
  framePrimaryColor: "#34d399",
  frameSecondaryColor: "#38bdf8",
  frameEmoji: "✨",
  fontPreset: "default",
  bio: null,
  badges: [],
};

const BACKGROUND_PRESETS: Record<string, { label: string; css: string }> = {
  default: {
    label: "Default Glass",
    css: "radial-gradient(circle at top left, rgba(52,211,153,0.16), transparent 36%), linear-gradient(135deg, rgba(24,24,27,0.96), rgba(3,7,18,0.98))",
  },
  emerald_forest: {
    label: "Emerald Forest",
    css: "radial-gradient(circle at 20% 10%, rgba(34,197,94,0.35), transparent 28%), linear-gradient(135deg, rgba(6,78,59,0.85), rgba(2,6,23,0.98))",
  },
  ice: {
    label: "Ice",
    css: "radial-gradient(circle at 80% 0%, rgba(56,189,248,0.35), transparent 30%), linear-gradient(135deg, rgba(12,74,110,0.72), rgba(2,6,23,0.98))",
  },
  inferno: {
    label: "Inferno",
    css: "radial-gradient(circle at 20% 0%, rgba(249,115,22,0.38), transparent 30%), linear-gradient(135deg, rgba(127,29,29,0.72), rgba(2,6,23,0.98))",
  },
  galaxy: {
    label: "Galaxy",
    css: "radial-gradient(circle at 30% 20%, rgba(168,85,247,0.34), transparent 30%), radial-gradient(circle at 80% 10%, rgba(59,130,246,0.22), transparent 28%), linear-gradient(135deg, rgba(30,27,75,0.82), rgba(2,6,23,0.98))",
  },
  neon: {
    label: "Neon",
    css: "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(99,102,241,0.18)), radial-gradient(circle at 85% 20%, rgba(236,72,153,0.28), transparent 28%), rgba(2,6,23,0.98)",
  },
  glass: {
    label: "Dark Glass",
    css: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), rgba(2,6,23,0.98)",
  },
};

const FRAME_PRESETS: Record<string, { label: string; className: string; frameClass?: string; ornament?: string; ornamentClass?: string }> = {
  none: { label: "None", className: "ring-white/10", frameClass: "profile-frame-basic" },
  emerald: { label: "Emerald Ring", className: "ring-emerald-300/70", frameClass: "profile-frame-emerald" },
  ice: { label: "Ice Ring", className: "ring-sky-300/70", frameClass: "profile-frame-ice" },
  inferno: { label: "Inferno Ring", className: "ring-orange-400/70", frameClass: "profile-frame-inferno", ornament: "🔥", ornamentClass: "profile-frame-ornament-br" },
  gold: { label: "Gold Ring", className: "ring-yellow-300/80", frameClass: "profile-frame-gold" },
  violet: { label: "Violet Ring", className: "ring-violet-300/70", frameClass: "profile-frame-violet" },
  owner: { label: "Owner Crown", className: "ring-yellow-300/90", frameClass: "profile-frame-owner", ornament: "👑", ornamentClass: "profile-frame-ornament-crown" },
  officer: { label: "Officer Shield", className: "ring-emerald-300/90", frameClass: "profile-frame-officer", ornament: "◆", ornamentClass: "profile-frame-ornament-shield" },
  crown: { label: "Royal Crown", className: "ring-amber-200/95", frameClass: "profile-frame-royal", ornament: "♛", ornamentClass: "profile-frame-ornament-crown" },
  laurel: { label: "Golden Laurel", className: "ring-yellow-200/90", frameClass: "profile-frame-laurel", ornament: "✦", ornamentClass: "profile-frame-ornament-br" },
  neon_pulse: { label: "Neon Pulse", className: "ring-fuchsia-300/80", frameClass: "profile-frame-neon", ornament: "✧", ornamentClass: "profile-frame-ornament-br" },
  galaxy_orbit: { label: "Galaxy Orbit", className: "ring-violet-200/80", frameClass: "profile-frame-galaxy", ornament: "✦", ornamentClass: "profile-frame-ornament-br" },
  diamond: { label: "Diamond Shine", className: "ring-cyan-100/90", frameClass: "profile-frame-diamond", ornament: "💎", ornamentClass: "profile-frame-ornament-br" },
  custom: { label: "Custom Builder", className: "ring-white/80", frameClass: "profile-frame-custom", ornamentClass: "profile-frame-ornament-br" },
};

const ACCENT_PRESETS = ["#34d399", "#38bdf8", "#ef4444", "#a78bfa", "#facc15", "#ec4899"];

const FONT_PRESETS: Record<
  string,
  {
    label: string;
    family: string;
    letterSpacing?: string;
    textTransform?: "none" | "uppercase";
    fontWeight?: number | string;
    fontStyle?: "normal" | "italic";
  }
> = {
  default: { label: "Default", family: "inherit" },
  nitro_block: {
    label: "Nitro Block",
    family: "Impact, Haettenschweiler, 'Arial Black', 'Arial Narrow Bold', sans-serif",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    fontWeight: 900,
  },
  terminal_mono: {
    label: "Terminal Mono",
    family: "'Courier New', Courier, 'Lucida Console', monospace",
    letterSpacing: "0.035em",
    fontWeight: 800,
  },
  royal_serif: {
    label: "Royal Serif",
    family: "Georgia, 'Times New Roman', Times, serif",
    fontWeight: 800,
  },
  rounded_bold: {
    label: "Rounded Bold",
    family: "Arial Rounded MT Bold, Trebuchet MS, Verdana, ui-rounded, system-ui, sans-serif",
    fontWeight: 800,
  },
  varsity: {
    label: "Varsity",
    family: "Rockwell, 'Roboto Slab', Georgia, serif",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    fontWeight: 900,
  },
  tech: {
    label: "Tech Wide",
    family: "Eurostile, 'Arial Narrow', 'Trebuchet MS', Arial, sans-serif",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
};

function getStyle(entry?: LeaderboardEntry | null) {
  return entry?.style ?? DEFAULT_STYLE;
}

function canManageCards(user: CurrentUser | null) {
  return user?.role === "officer" || user?.role === "owner";
}

function safeFrameColor(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "")) ? String(value) : fallback;
}

function safeFrameEmoji(value: string | null | undefined) {
  return String(value ?? "✨").trim().slice(0, 4) || "✨";
}

function fontStyle(style: ProfileStyle): CSSProperties {
  const preset = FONT_PRESETS[style.fontPreset ?? "default"] ?? FONT_PRESETS.default;
  return {
    fontFamily: preset.family,
    letterSpacing: preset.letterSpacing,
    textTransform: preset.textTransform,
    fontWeight: preset.fontWeight,
    fontStyle: preset.fontStyle,
  };
}

function backgroundCss(style: ProfileStyle) {
  return BACKGROUND_PRESETS[style.backgroundPreset]?.css ?? BACKGROUND_PRESETS.default.css;
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
              {formatPoints(entry.points)} points
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
      text: `👑 Current leader: ${players[0].name} with ${formatPoints(players[0].points)} points`,
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

    const diff = typeof entry.points === "number" && typeof old.points === "number"
      ? entry.points - old.points
      : 0;

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

function BackgroundLayer({ style }: { style: ProfileStyle }) {
  if (style.backgroundUrl && style.backgroundType === "video") {
    return (
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-35"
        src={style.backgroundUrl}
        autoPlay
        muted
        loop
        playsInline
      />
    );
  }

  if (style.backgroundUrl) {
    return (
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${style.backgroundUrl})` }}
      />
    );
  }

  return <div className="absolute inset-0" style={{ background: backgroundCss(style), opacity: 0.9 }} />;
}

function AvatarWithFrame({ entry, size = "md" }: { entry: LeaderboardEntry; size?: "md" | "lg" }) {
  const style = getStyle(entry);
  const framePreset = FRAME_PRESETS[style.framePreset] ?? FRAME_PRESETS.none;
  const frame = framePreset.className;
  const sizeClass = size === "lg" ? "h-24 w-24 ring-4" : "h-16 w-16 ring-4";
  const ornamentSize = size === "lg" ? "text-2xl" : "text-lg";
  const primaryFrameColor = safeFrameColor(style.framePrimaryColor, style.accentColor);
  const secondaryFrameColor = safeFrameColor(style.frameSecondaryColor, "#38bdf8");
  const ornament = style.framePreset === "custom" ? safeFrameEmoji(style.frameEmoji) : framePreset.ornament;

  return (
    <div className={`profile-frame-wrap relative flex shrink-0 items-center justify-center ${size === "lg" ? "h-28 w-28" : "h-20 w-20"}`}>
      <span
        className={`profile-frame-aura ${framePreset.frameClass ?? "profile-frame-basic"}`}
        style={{
          "--frame-accent": style.accentColor,
          "--frame-primary": primaryFrameColor,
          "--frame-secondary": secondaryFrameColor,
        } as CSSProperties}
      />
      <div
        className={`relative z-10 flex items-center justify-center overflow-hidden rounded-full ${sizeClass} ${frame}`}
        style={{ boxShadow: `0 0 28px ${style.accentColor}55` }}
      >
        {entry.avatar ? (
          <img src={entry.avatar} alt={entry.name} className="h-full w-full object-cover" />
        ) : (
          <InitialAvatar name={entry.name} />
        )}
      </div>
      {ornament && (
        <span className={`profile-frame-ornament ${framePreset.ornamentClass ?? "profile-frame-ornament-br"} ${ornamentSize}`}>
          {ornament}
        </span>
      )}
    </div>
  );
}

function LeaderboardRow({
  entry,
  change,
  onOpen,
}: {
  entry: LeaderboardEntry;
  change: number;
  onOpen: () => void;
}) {
  const style = getStyle(entry);
  const badges = [entry.is_alt ? "Alt" : null, ...(style.badges ?? [])].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="smooth-card group relative w-full overflow-hidden rounded-3xl border p-0 text-left shadow-2xl shadow-black/20 transition-all duration-300 hover:-translate-y-0.5"
      style={{ borderColor: `${style.accentColor}55` }}
    >
      <BackgroundLayer style={style} />
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] transition group-hover:bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: style.accentColor }} />

      <div className="relative grid min-h-28 grid-cols-[4.5rem_1fr] items-center gap-4 p-4 sm:grid-cols-[5rem_5rem_1.6fr_1fr_1fr_1fr] sm:gap-5">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border bg-black/35 text-lg font-bold text-zinc-100 sm:h-16 sm:w-16" style={{ borderColor: `${style.accentColor}55` }}>
          {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
          {change !== 0 && (
            <span className={`absolute -right-2 -top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${change > 0 ? "bg-emerald-400 text-black" : "bg-red-400 text-black"}`}>
              {change > 0 ? `▲${change}` : `▼${Math.abs(change)}`}
            </span>
          )}
        </div>

        <div className="hidden sm:block">
          <AvatarWithFrame entry={entry} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-3 sm:hidden">
            <AvatarWithFrame entry={entry} />
            <div className="min-w-0">
              <h3 className="truncate text-xl font-bold" style={{ color: style.accentColor, ...fontStyle(style) }}>{entry.name}</h3>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Rank #{entry.rank}</p>
            </div>
          </div>

          <div className="hidden sm:block">
            <h3 className="truncate text-2xl font-bold" style={{ color: style.accentColor, ...fontStyle(style) }}>{entry.name}</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-zinc-400">{entry.discord_id ? "Linked member" : "Roblox member"}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {badges.slice(0, 4).map((badge) => (
              <span key={String(badge)} className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-zinc-200">
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="hidden text-right sm:block">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Points</div>
          <div className="mt-1 text-xl font-bold text-white">{formatPoints(entry.points)}</div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">5m Change</div>
          <div className="mt-1 text-xl font-bold text-white">{entry.change5m && entry.change5m > 0 ? `+${formatNumber(entry.change5m)}` : "—"}</div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Disconnects 24h</div>
          <div className="mt-1 text-xl font-bold text-white">{entry.disconnects24h ?? 0}</div>
        </div>
      </div>
    </button>
  );
}

function MiniLineChart({
  points,
  accentColor,
  emptyLabel = "Not enough data yet",
}: {
  points: PlayerHistoryPoint[];
  accentColor: string;
  emptyLabel?: string;
}) {
  if (points.length < 1) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-sm text-zinc-400">
        {emptyLabel}
      </div>
    );
  }

  const chartSeries = points.length === 1
    ? [
        { ...points[0], time: new Date(new Date(points[0].time).getTime() - 60_000).toISOString() },
        points[0],
      ]
    : points;

  const width = 720;
  const height = 220;
  const padding = 18;
  const values = chartSeries.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = chartSeries.map((point, index) => {
    const x = padding + (index / Math.max(chartSeries.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible">
        <defs>
          <linearGradient id="playerChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`${padding},${height - padding} ${coords.join(" ")} ${width - padding},${height - padding}`}
          fill="url(#playerChartFill)"
          stroke="none"
        />
        <polyline points={coords.join(" ")} fill="none" stroke={accentColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((coord, index) => {
          if (index !== coords.length - 1 && index !== 0) return null;
          const [x, y] = coord.split(",").map(Number);
          return <circle key={coord} cx={x} cy={y} r="5" fill={accentColor} />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-zinc-500">
        <span>{new Date(chartSeries[0].time).toLocaleDateString()}</span>
        <span>{points.length === 1 ? "First snapshot" : new Date(chartSeries[chartSeries.length - 1].time).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function PlayerMiniProfile({
  entry,
  currentUser,
  onClose,
  onEditCard,
}: {
  entry: LeaderboardEntry | null;
  currentUser: CurrentUser | null;
  onClose: () => void;
  onEditCard: (entry: LeaderboardEntry) => void;
}) {
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [historyTab, setHistoryTab] = useState<"points" | "rank" | "disconnects">("points");
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!entry) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setHistoryLoading(true);
      setHistory(null);
      setHistoryTab("points");

      fetch(`/api/leaderboard/player/${entry.user_id}/history`, {
        cache: "no-store",
        signal: controller.signal,
      })
      .then((res) => res.json())
      .then((json) => {
        if (controller.signal.aborted) return;
        setHistory({
          points: Array.isArray(json.points) ? json.points : [],
          rank: Array.isArray(json.rank) ? json.rank : [],
          disconnects: Array.isArray(json.disconnects) ? json.disconnects : [],
          disconnects24h: Number(json.disconnects24h ?? 0),
          change5m: Number(json.change5m ?? 0),
          pph: Number(json.pph ?? 0),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistory({ points: [], rank: [], disconnects: [], disconnects24h: 0, change5m: 0, pph: 0 });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [entry]);

  if (!entry) return null;
  const style = getStyle(entry);
  const officerTools = canManageCards(currentUser);
  const disconnects24h = history?.disconnects24h ?? entry.disconnects24h ?? 0;
  const change5m = history?.change5m ?? entry.change5m ?? 0;
  const pph = history?.pph ?? entry.pph ?? 0;
  const chartPoints = history?.[historyTab] ?? [];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <button className="modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close profile" />
      <div className="modal-panel relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border shadow-2xl" style={{ borderColor: `${style.accentColor}66`, background: "var(--background)" }}>
        <BackgroundLayer style={style} />
        <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AvatarWithFrame entry={entry} size="lg" />
              <div>
                <div className="text-xs uppercase tracking-[0.28em]" style={{ color: style.accentColor }}>Rank #{entry.rank}</div>
                <h2 className="mt-1 text-4xl font-bold text-white" style={fontStyle(style)}>{entry.name}</h2>
                <p className="mt-2 max-w-xl text-sm italic text-zinc-300" style={fontStyle(style)}>{style.bio || "No bio yet. Customise your card to add one."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(style.badges?.length ? style.badges : [entry.discord_id ? "Discord linked" : "Roblox member"]).map((badge) => (
                    <span key={badge} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-zinc-200">{badge}</span>
                  ))}
                </div>
              </div>
            </div>
            <button className="admin-button" onClick={onClose}>×</button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <MiniProfileStat label="Battle Points" value={formatPoints(entry.points)} />
            <MiniProfileStat label="PPH" value={pph > 0 ? formatNumber(pph) : "—"} />
            <MiniProfileStat label="5m Change" value={change5m > 0 ? `+${formatNumber(change5m)}` : "—"} />
            <MiniProfileStat label="Disconnects 24h" value={String(disconnects24h)} />
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-black/45 p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">Player History</h3>
                <span className="text-xs text-zinc-500">Points • Rank • Disconnects</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["points", "rank", "disconnects"] as const).map((tab) => (
                  <button
                    key={tab}
                    className="rounded-full border px-3 py-1 text-xs capitalize"
                    style={{
                      borderColor: historyTab === tab ? `${style.accentColor}88` : "rgba(255,255,255,0.12)",
                      background: historyTab === tab ? `${style.accentColor}22` : "rgba(255,255,255,0.04)",
                      color: historyTab === tab ? style.accentColor : "rgb(212 212 216)",
                    }}
                    onClick={() => setHistoryTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            {historyLoading ? (
              <div className="flex h-56 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-sm text-zinc-400">
                Loading history...
              </div>
            ) : (
              <MiniLineChart points={chartPoints} accentColor={style.accentColor} />
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a className="admin-button" href={`https://www.roblox.com/users/${entry.user_id}/profile`} target="_blank" rel="noreferrer">Open Roblox Profile ↗</a>
            <a className="admin-button" href={`/profile/${entry.user_id}`}>Open MCWV Profile</a>
            {officerTools && (
              <button type="button" className="admin-button" onClick={() => onEditCard(entry)}>Officer Override Card</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function StyleEditorModal({
  open,
  currentUser,
  targetEntry,
  onClose,
  onSaved,
}: {
  open: boolean;
  currentUser: CurrentUser | null;
  targetEntry: LeaderboardEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [backgroundPreset, setBackgroundPreset] = useState("default");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#34d399");
  const [framePreset, setFramePreset] = useState("none");
  const [framePrimaryColor, setFramePrimaryColor] = useState("#34d399");
  const [frameSecondaryColor, setFrameSecondaryColor] = useState("#38bdf8");
  const [frameEmoji, setFrameEmoji] = useState("✨");
  const [fontPreset, setFontPreset] = useState("default");
  const [bio, setBio] = useState("");
  const [badgesText, setBadgesText] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const officerTools = canManageCards(currentUser);
  const targetRobloxId = targetEntry ? String(targetEntry.user_id) : currentUser?.roblox_id ? String(currentUser.roblox_id) : "";
  const editingAnotherMember = Boolean(targetEntry && targetRobloxId !== String(currentUser?.roblox_id ?? ""));
  const canEditBadges = officerTools;

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    async function loadSavedStyle() {
      setStatus("Loading saved style...");
      try {
        const params = new URLSearchParams();
        if (targetEntry) params.set("robloxId", String(targetEntry.user_id));

        const res = await fetch(`/api/leaderboard/style?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));

        if (controller.signal.aborted) return;

        if (!res.ok) {
          setStatus(data.error ?? "No saved style found yet.");
          return;
        }

        const saved = data.style;
        if (!saved) {
          setBackgroundPreset("default");
          setBackgroundUrl("");
          setAccentColor("#34d399");
          setFramePreset("none");
          setFramePrimaryColor("#34d399");
          setFrameSecondaryColor("#38bdf8");
          setFrameEmoji("✨");
          setFontPreset("default");
          setBio("");
          setBadgesText("");
          setStatus("No saved style yet — pick your first look.");
          return;
        }

        setBackgroundPreset(String(saved.backgroundPreset ?? saved.background_preset ?? "default"));
        setBackgroundUrl(String(saved.backgroundUrl ?? saved.background_url ?? ""));
        setAccentColor(String(saved.accentColor ?? saved.accent_color ?? "#34d399"));
        setFramePreset(String(saved.framePreset ?? saved.frame_preset ?? "none"));
        setFramePrimaryColor(String(saved.framePrimaryColor ?? saved.frame_primary_color ?? "#34d399"));
        setFrameSecondaryColor(String(saved.frameSecondaryColor ?? saved.frame_secondary_color ?? "#38bdf8"));
        setFrameEmoji(String(saved.frameEmoji ?? saved.frame_emoji ?? "✨"));
        const savedFont = String(saved.fontPreset ?? saved.font_preset ?? "default");
        setFontPreset(FONT_PRESETS[savedFont] ? savedFont : "default");
        setBio(String(saved.bio ?? ""));
        const savedBadges = Array.isArray(saved.badges) ? saved.badges.map(String) : [];
        setBadgesText(savedBadges.join(", "));
        setStatus("Saved style loaded.");
      } catch (err) {
        if (!controller.signal.aborted) {
          setStatus(err instanceof Error ? err.message : "Failed to load saved style");
        }
      }
    }

    void loadSavedStyle();

    return () => controller.abort();
  }, [open, targetEntry]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    setStatus("Saving...");
    try {
      const res = await fetch("/api/leaderboard/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRobloxId: targetEntry ? String(targetEntry.user_id) : undefined,
          backgroundPreset,
          backgroundUrl: backgroundUrl.trim() || null,
          accentColor,
          framePreset,
          framePrimaryColor,
          frameSecondaryColor,
          frameEmoji: frameEmoji.trim() || "✨",
          fontPreset,
          bio: bio.trim() || null,
          badges: canEditBadges ? badgesText.split(",").map((badge) => badge.trim()).filter(Boolean) : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save style");
      setStatus("Saved. Refreshing leaderboard...");
      await onSaved();
      onClose();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save style");
    } finally {
      setSaving(false);
    }
  }

  const previewStyle: ProfileStyle = {
    backgroundUrl: backgroundUrl.trim() || null,
    backgroundType: backgroundUrl.endsWith(".mp4") || backgroundUrl.endsWith(".webm") ? "video" : backgroundUrl.endsWith(".gif") ? "gif" : backgroundUrl ? "image" : null,
    backgroundPreset,
    accentColor,
    framePreset,
    framePrimaryColor,
    frameSecondaryColor,
    frameEmoji,
    fontPreset,
    bio: bio || null,
    badges: badgesText.split(",").map((badge) => badge.trim()).filter(Boolean),
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button className="modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close editor" />
      <div className="modal-panel relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border p-5 shadow-2xl sm:p-6" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">Leaderboard Style</div>
            <h2 className="mt-1 text-2xl font-bold text-white">{editingAnotherMember ? `Override ${targetEntry?.name}'s Card` : "Customise My Card"}</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Signed in as {currentUser?.username ?? "unknown"}. {editingAnotherMember ? "Officer tools are enabled for this card." : "Your Roblox account must be linked."}
            </p>
          </div>
          <button className="admin-button" onClick={onClose}>×</button>
        </div>

        <div className="mb-6 overflow-hidden rounded-3xl border border-white/10 p-5" style={{ borderColor: `${accentColor}55` }}>
          <div className="absolute" />
          <div className="rounded-2xl p-5" style={{ background: backgroundCss(previewStyle) }}>
            <div className="text-xs uppercase tracking-[0.2em]" style={{ color: accentColor }}>Preview</div>
            <div className="mt-2 text-3xl font-bold" style={{ color: accentColor, ...fontStyle(previewStyle) }}>{targetEntry?.name ?? currentUser?.username ?? "Your Card"}</div>
            <p className="mt-2 max-w-lg text-sm italic text-zinc-200" style={fontStyle(previewStyle)}>{bio || "Your bio or quote will appear here."}</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="profile-frame-wrap relative flex h-20 w-20 items-center justify-center">
                <span
                  className={`profile-frame-aura ${FRAME_PRESETS[framePreset]?.frameClass ?? "profile-frame-basic"}`}
                  style={{
                    "--frame-accent": accentColor,
                    "--frame-primary": framePrimaryColor,
                    "--frame-secondary": frameSecondaryColor,
                  } as CSSProperties}
                />
                <div className={`relative z-10 h-14 w-14 rounded-full bg-black/45 ring-4 ${FRAME_PRESETS[framePreset]?.className ?? FRAME_PRESETS.none.className}`} style={{ boxShadow: `0 0 24px ${accentColor}66` }} />
                {(framePreset === "custom" ? safeFrameEmoji(frameEmoji) : FRAME_PRESETS[framePreset]?.ornament) && (
                  <span className={`profile-frame-ornament ${FRAME_PRESETS[framePreset]?.ornamentClass ?? "profile-frame-ornament-br"} text-lg`}>
                    {framePreset === "custom" ? safeFrameEmoji(frameEmoji) : FRAME_PRESETS[framePreset]?.ornament}
                  </span>
                )}
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-zinc-300">{FRAME_PRESETS[framePreset]?.label ?? "Frame preview"}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="admin-label">Background preset</span>
            <select className="admin-input" value={backgroundPreset} onChange={(event) => setBackgroundPreset(event.target.value)}>
              {Object.entries(BACKGROUND_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="admin-label">Frame</span>
            <select className="admin-input" value={framePreset} onChange={(event) => setFramePreset(event.target.value)}>
              {Object.entries(FRAME_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
            </select>
          </label>
          {framePreset === "custom" && (
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="admin-label">Frame Colour 1</span>
                <input type="color" value={framePrimaryColor} onChange={(event) => setFramePrimaryColor(event.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-black/30" />
              </label>
              <label className="space-y-2">
                <span className="admin-label">Frame Colour 2</span>
                <input type="color" value={frameSecondaryColor} onChange={(event) => setFrameSecondaryColor(event.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-black/30" />
              </label>
              <label className="space-y-2">
                <span className="admin-label">Emoji</span>
                <input className="admin-input text-center text-xl" value={frameEmoji} onChange={(event) => setFrameEmoji(event.target.value.slice(0, 4))} placeholder="✨" />
              </label>
            </div>
          )}
          <label className="space-y-2 sm:col-span-2">
            <span className="admin-label">Profile Font</span>
            <select className="admin-input" value={fontPreset} onChange={(event) => setFontPreset(event.target.value)}>
              {Object.entries(FONT_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">Nitro-style font presets for your name and bio.</p>
          </label>
          <label className="space-y-2">
            <span className="admin-label">Accent colour</span>
            <div className="flex gap-2">
              <input className="admin-input" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
              <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="h-12 w-14 rounded-2xl border border-white/10 bg-black/30" />
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((color) => <button key={color} type="button" className="h-7 w-7 rounded-full border border-white/20" style={{ background: color }} onClick={() => setAccentColor(color)} />)}
            </div>
          </label>
          <label className="space-y-2">
            <span className="admin-label">Custom background URL</span>
            <input className="admin-input" value={backgroundUrl} onChange={(event) => setBackgroundUrl(event.target.value)} placeholder="https://...jpg, gif, mp4, webm" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="admin-label">Bio / quote</span>
            <textarea className="admin-input min-h-24" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={220} />
          </label>
          {canEditBadges ? (
            <label className="space-y-2 sm:col-span-2">
              <span className="admin-label">Badges</span>
              <input className="admin-input" value={badgesText} onChange={(event) => setBadgesText(event.target.value)} placeholder="Donator, Whale, Elite Performer" />
              <p className="text-xs text-zinc-500">Officer-only. Normal members can customise looks/bio, but badges are assigned by officers.</p>
            </label>
          ) : (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2">
              <span className="admin-label">Badges</span>
              <p className="text-sm text-zinc-400">Badges are assigned by officers. Your current badges will be kept when you save.</p>
            </div>
          )}
        </div>

        {status && <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-200">{status}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="admin-button" onClick={onClose}>Cancel</button>
          <button className="admin-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save Style"}</button>
        </div>
      </div>
    </div>
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
  const [now, setNow] = useState(0);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [selectedStyleTarget, setSelectedStyleTarget] = useState<LeaderboardEntry | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activity, setActivity] = useState<Array<{ id: string; type: "points" | "rankup" | "rankdown" | "crown" | "join"; text: string }>>([]);

  const prevSnapshot = useRef<string>("");
  const prevRanksRef = useRef<Record<number, number>>({});
  const prevDataRef = useRef<LeaderboardEntry[]>([]);

  async function load(forceRefresh = false) {
    try {
      const params = new URLSearchParams();
      if (selectedBattleId) params.set("battle_id", selectedBattleId);
      if (forceRefresh && !selectedBattleId) params.set("refresh", "1");

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
    const initial = window.setTimeout(() => void load(true), 0);
    const interval = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.clearTimeout(initial);
      clearInterval(interval);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBattleId]);

  useEffect(() => {
    async function loadMe() {
      const res = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const json = await res.json().catch(() => ({}));
      setCurrentUser(json.user ?? null);
    }

    loadMe();
  }, []);

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
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => {
                        setSelectedStyleTarget(null);
                        setStyleEditorOpen(true);
                      }}
                    >
                      Customise My Card
                    </button>
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
              {active && data.some((entry) => typeof entry.points === "number") && (
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
              )}

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
                          <LeaderboardRow entry={entry} change={change} onOpen={() => setSelectedEntry(entry)} />
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

        <PlayerMiniProfile
          entry={selectedEntry}
          currentUser={currentUser}
          onClose={() => setSelectedEntry(null)}
          onEditCard={(entry) => {
            setSelectedStyleTarget(entry);
            setSelectedEntry(null);
            setStyleEditorOpen(true);
          }}
        />
        <StyleEditorModal
          open={styleEditorOpen}
          currentUser={currentUser}
          targetEntry={selectedStyleTarget}
          onClose={() => setStyleEditorOpen(false)}
          onSaved={() => load(true)}
        />

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

          @keyframes modalBackdropIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes modalPanelIn {
            from {
              opacity: 0;
              transform: translateY(18px) scale(0.97);
              filter: blur(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes cardGlowSweep {
            from { transform: translateX(-120%) rotate(12deg); }
            to { transform: translateX(220%) rotate(12deg); }
          }

          .animate-fade-in {
            opacity: 0;
            animation: fadeInUp 0.5s ease-out forwards;
          }

          .feed-pop {
            animation: feedPop 0.4s ease-out forwards;
          }

          .modal-backdrop {
            animation: modalBackdropIn 0.22s ease-out forwards;
          }

          .modal-panel {
            transform-origin: center;
            animation: modalPanelIn 0.34s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          .smooth-card::before {
            content: "";
            position: absolute;
            inset: -45% auto -45% -35%;
            width: 28%;
            pointer-events: none;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
            opacity: 0;
            transform: translateX(-120%) rotate(12deg);
          }

          .smooth-card:hover::before {
            opacity: 1;
            animation: cardGlowSweep 0.85s ease-out;
          }

          @keyframes framePulse {
            0%, 100% { transform: scale(1); opacity: 0.78; }
            50% { transform: scale(1.08); opacity: 1; }
          }

          @keyframes frameOrbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes crownFloat {
            0%, 100% { transform: translate(-50%, -12%) rotate(-8deg); }
            50% { transform: translate(-50%, -26%) rotate(6deg); }
          }

          .profile-frame-wrap {
            isolation: isolate;
          }

          .profile-frame-aura {
            position: absolute;
            z-index: 0;
            inset: 0.25rem;
            border-radius: 999px;
            pointer-events: none;
            background: radial-gradient(circle, color-mix(in srgb, var(--frame-accent) 26%, transparent), transparent 62%);
            border: 1px solid color-mix(in srgb, var(--frame-accent) 34%, rgba(255,255,255,0.18));
            box-shadow: 0 0 24px color-mix(in srgb, var(--frame-accent) 55%, transparent);
          }

          .profile-frame-aura::before,
          .profile-frame-aura::after {
            content: "";
            position: absolute;
            inset: -0.22rem;
            border-radius: inherit;
            pointer-events: none;
          }

          .profile-frame-basic { opacity: 0.35; }
          .profile-frame-emerald {
            background: conic-gradient(from 120deg, rgba(16,185,129,0.95), rgba(6,95,70,0.45), rgba(52,211,153,0.95), rgba(16,185,129,0.95));
            box-shadow: 0 0 28px rgba(52, 211, 153, 0.45), inset 0 0 18px rgba(52, 211, 153, 0.18);
          }
          .profile-frame-ice {
            background: linear-gradient(135deg, rgba(255,255,255,0.88), rgba(125,211,252,0.88), rgba(37,99,235,0.42));
            box-shadow: 0 0 28px rgba(125, 211, 252, 0.52), inset 0 0 18px rgba(186, 230, 253, 0.18);
          }
          .profile-frame-gold {
            background: repeating-conic-gradient(from 0deg, rgba(250,204,21,0.95) 0deg 20deg, rgba(255,255,255,0.65) 20deg 30deg, rgba(180,83,9,0.78) 30deg 45deg);
            box-shadow: 0 0 34px rgba(250, 204, 21, 0.52), inset 0 0 18px rgba(250, 204, 21, 0.16);
          }
          .profile-frame-violet {
            background: radial-gradient(circle at 30% 20%, rgba(216,180,254,0.95), transparent 25%), conic-gradient(from 45deg, rgba(124,58,237,0.95), rgba(236,72,153,0.7), rgba(59,130,246,0.65), rgba(124,58,237,0.95));
            box-shadow: 0 0 30px rgba(167, 139, 250, 0.5), inset 0 0 18px rgba(167, 139, 250, 0.17);
          }

          .profile-frame-owner {
            background:
              radial-gradient(circle, rgba(250,204,21,0.24), transparent 61%),
              conic-gradient(from 15deg, rgba(250,204,21,0.95), rgba(255,255,255,0.55), rgba(245,158,11,0.95), rgba(250,204,21,0.95));
            box-shadow: 0 0 36px rgba(250, 204, 21, 0.65), inset 0 0 18px rgba(255,255,255,0.2);
            animation: framePulse 2.8s ease-in-out infinite;
          }

          .profile-frame-officer {
            background:
              radial-gradient(circle, rgba(52,211,153,0.20), transparent 60%),
              conic-gradient(from 90deg, rgba(16,185,129,0.9), rgba(125,211,252,0.7), rgba(16,185,129,0.9));
            box-shadow: 0 0 32px rgba(52, 211, 153, 0.55), inset 0 0 16px rgba(125,211,252,0.16);
          }

          .profile-frame-royal {
            background:
              repeating-conic-gradient(from 18deg, rgba(251,191,36,0.98) 0deg 18deg, rgba(255,255,255,0.78) 18deg 28deg, rgba(180,83,9,0.98) 28deg 44deg),
              radial-gradient(circle, rgba(251,191,36,0.26), transparent 62%);
            box-shadow: 0 0 42px rgba(251,191,36,0.68), 0 0 14px rgba(255,255,255,0.25), inset 0 0 20px rgba(255,255,255,0.22);
            animation: framePulse 3.4s ease-in-out infinite;
          }

          .profile-frame-inferno {
            background: conic-gradient(from 180deg, rgba(239,68,68,0.95), rgba(251,146,60,0.95), rgba(250,204,21,0.65), rgba(239,68,68,0.95));
            box-shadow: 0 0 34px rgba(249,115,22,0.6), inset 0 0 16px rgba(239,68,68,0.22);
            animation: framePulse 2.4s ease-in-out infinite;
          }

          .profile-frame-neon {
            background: conic-gradient(from 0deg, #22d3ee, #a78bfa, #ec4899, #22d3ee);
            box-shadow: 0 0 34px rgba(236,72,153,0.62), 0 0 18px rgba(34,211,238,0.42);
            animation: frameOrbit 7s linear infinite;
          }

          .profile-frame-galaxy {
            background: conic-gradient(from 45deg, #60a5fa, #a78bfa, #f0abfc, #22d3ee, #60a5fa);
            box-shadow: 0 0 34px rgba(167,139,250,0.62), inset 0 0 20px rgba(96,165,250,0.20);
            animation: frameOrbit 11s linear infinite;
          }

          .profile-frame-diamond {
            background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(125,211,252,0.95), rgba(14,165,233,0.75), rgba(255,255,255,0.9));
            box-shadow: 0 0 34px rgba(125,211,252,0.68), inset 0 0 18px rgba(255,255,255,0.28);
          }

          .profile-frame-custom {
            background: conic-gradient(from 0deg, var(--frame-primary), var(--frame-secondary), var(--frame-primary));
            box-shadow: 0 0 34px color-mix(in srgb, var(--frame-primary) 58%, transparent), 0 0 20px color-mix(in srgb, var(--frame-secondary) 42%, transparent);
            animation: frameOrbit 9s linear infinite;
          }

          .profile-frame-laurel {
            background: conic-gradient(from 0deg, rgba(250,204,21,0.95), rgba(255,255,255,0.55), rgba(202,138,4,0.95), rgba(250,204,21,0.95));
            box-shadow: 0 0 32px rgba(250,204,21,0.56);
          }

          .profile-frame-ornament {
            position: absolute;
            z-index: 20;
            display: grid;
            place-items: center;
            width: 1.8em;
            height: 1.8em;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.26);
            background: rgba(2,6,23,0.88);
            box-shadow: 0 0 18px rgba(0,0,0,0.45);
            line-height: 1;
          }

          .profile-frame-ornament-crown {
            left: 50%;
            top: -0.35rem;
            transform: translate(-50%, -12%) rotate(-8deg);
            animation: crownFloat 2.6s ease-in-out infinite;
          }

          .profile-frame-ornament-br {
            right: 0.05rem;
            bottom: 0.05rem;
          }

          .profile-frame-ornament-shield {
            right: -0.1rem;
            bottom: 0.25rem;
            color: #34d399;
          }

.admin-button {
            border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
            border-radius: 999px;
            background: color-mix(in srgb, var(--primary) 13%, transparent);
            padding: 0.55rem 0.9rem;
            color: var(--foreground);
            font-size: 0.85rem;
            transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
          }
          .admin-button:hover:not(:disabled) {
            background: color-mix(in srgb, var(--primary) 22%, transparent);
            border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
            transform: translateY(-1px);
          }
          .admin-button:disabled {
            cursor: not-allowed;
            opacity: 0.45;
          }
          .admin-input {
            width: 100%;
            border-radius: 1rem;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--foreground);
            padding: 0.75rem 1rem;
            font-size: 0.875rem;
            outline: none;
          }
          .admin-input:focus {
            border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
          }
          .admin-label {
            display: block;
            color: color-mix(in srgb, var(--foreground) 55%, transparent);
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.18em;
            text-transform: uppercase;
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
