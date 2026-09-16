"use client";

/* eslint-disable @next/next/no-img-element -- Discord/CDN avatars are remote
   and dynamic; the rest of the hub renders them with plain <img> too. */

import Navbar from "@/components/Navbar";
import FlowNumber from "@/components/FlowNumber";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCompact } from "@/lib/numbers";

export const dynamic = "force-dynamic";

/* ============================== types ============================== */

type Entrant = {
  robloxId: string;
  username: string;
  avatarUrl: string | null;
  status: "alive" | "eliminated" | string;
  eliminatedRound: number | null;
  finalPlace: number | null;
};

type FeedEntry = {
  robloxId: string;
  username: string;
  avatarUrl: string | null;
  round: number | null;
  lostTo: { username: string; avatarUrl: string | null }[];
  at: string | null;
};

type RoundMeta = {
  roundNo: number;
  voided: boolean;
  note: string | null;
  eliminatedCount: number;
  at: string | null;
};

type StandingsRow = {
  robloxId: string;
  username: string;
  avatarUrl: string | null;
  finalPlace: number;
  eliminatedRound: number | null;
};

type BountyEvent = {
  id: number;
  status: "signup" | "active" | "ended" | "aborted" | string;
  battleId: string | null;
  battleName: string | null;
  signupCap: number;
  entrantsCount: number;
  aliveCount: number;
  eliminatedCount: number;
  roundCount: number;
  startedAt: string | null;
  endedAt: string | null;
  nextRoundAt: string | null;
  lastRoundAt: string | null;
  prize: { title: string | null; body: string | null; imageUrl: string | null };
  winner: { robloxId: string; username: string; avatarUrl: string | null; finalPlace: number | null } | null;
  endNote: string | null;
};

type PublicState = {
  success: boolean;
  event: BountyEvent | null;
  entrants: Entrant[];
  feed: FeedEntry[];
  rounds: RoundMeta[];
  standings: StandingsRow[];
  updatedAt: string;
};

type MeState = {
  success: boolean;
  role?: "member" | "officer" | "owner" | string;
  robloxId?: string | null;
  eventStatus: string | null;
  signedUp: boolean;
  status: string | null;
  eliminatedRound: number | null;
  finalPlace: number | null;
  roundNo: number | null;
  you: { pointsNow: number | null; roundGain: number | null; lastPph: number | null } | null;
  targets: {
    robloxId: string;
    username: string;
    avatarUrl: string | null;
    pointsNow: number | null;
    roundGain: number | null;
    lastPph: number | null;
  }[];
};

type AdminState = {
  success: boolean;
  event: {
    id: number;
    status: string;
    battleId: string | null;
    battleName: string | null;
    signupCap: number;
    entrantsCount: number;
    roundCount: number;
    prize: { title: string | null; body: string | null; imageUrl: string | null };
  } | null;
  battles: { battleId: string; battleName: string | null; startTime: string | null; endTime: string | null; active: boolean; upcoming: boolean }[];
  eliminated: { robloxId: string; username: string; eliminatedRound: number | null }[];
  entrantsCount: number;
};

/* ============================== constants ============================== */

const POLL_PUBLIC_MS = 30_000;
const POLL_ME_MS = 30_000;
const AHEAD = "#22c55e";
const BEHIND = "#ef4444";
const TIED = "#a1a1aa";

const SPRING = { type: "spring" as const, stiffness: 320, damping: 34 };

/* ============================== helpers ============================== */

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/* ============================== atoms ============================== */

function Avatar({
  src,
  name,
  size = 40,
  className = "",
  dimmed = false,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
  dimmed?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`bh-avatar ${dimmed ? "bh-avatar-dead" : ""} ${className}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div style={style} className={`bh-avatar bh-initials ${dimmed ? "bh-avatar-dead" : ""} ${className}`} aria-hidden>
      {initials(name)}
    </div>
  );
}

function Crosshair({ size = 220, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`bh-crosshair ${className}`}
      aria-hidden
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 3" />
      <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <line x1="50" y1="0" x2="50" y2="20" stroke="currentColor" strokeWidth="1.25" />
      <line x1="50" y1="80" x2="50" y2="100" stroke="currentColor" strokeWidth="1.25" />
      <line x1="0" y1="50" x2="20" y2="50" stroke="currentColor" strokeWidth="1.25" />
      <line x1="80" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="50" cy="50" r="1.8" fill="currentColor" />
    </svg>
  );
}

function Chip({ tone, children }: { tone: "ahead" | "behind" | "tied" | "neutral" | "live"; children: React.ReactNode }) {
  const color = tone === "ahead" ? AHEAD : tone === "behind" ? BEHIND : tone === "live" ? "var(--primary)" : TIED;
  return (
    <span className={`bh-chip ${tone === "live" ? "bh-chip-live" : ""}`} style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      {children}
    </span>
  );
}

/* ============================== hero ============================== */

function StatusPill({ event, now }: { event: BountyEvent | null; now: number }) {
  if (!event) {
    return (
      <Chip tone="neutral">
        <span className="bh-dot" style={{ background: Z_TIED }} /> No hunt scheduled
      </Chip>
    );
  }
  if (event.status === "signup") {
    return (
      <Chip tone="live">
        <span className="bh-dot bh-dot-pulse" style={{ background: "var(--primary)" }} /> Sign-ups open
      </Chip>
    );
  }
  if (event.status === "active") {
    return (
      <Chip tone="live">
        <span className="bh-dot bh-dot-pulse" style={{ background: "var(--primary)" }} /> Live - round {event.roundCount + 1}
      </Chip>
    );
  }
  if (event.status === "ended") {
    return <Chip tone="neutral">Ended {timeAgo(event.endedAt, now)}</Chip>;
  }
  return <Chip tone="behind">Stopped by staff</Chip>;
}

function CountdownBar({ event, now }: { event: BountyEvent | null; now: number }) {
  if (!event || event.status !== "active" || !event.nextRoundAt) return null;
  const target = new Date(event.nextRoundAt).getTime();
  const last = event.lastRoundAt ? new Date(event.lastRoundAt).getTime() : target - 60 * 60 * 1000;
  const span = Math.max(1, target - last);
  const left = target - now;
  const pct = Math.min(100, Math.max(0, ((span - left) / span) * 100));
  return (
    <div className="bh-countdown">
      <div className="bh-countdown-top">
        <span className="bh-label">Next checkpoint</span>
        <span className="bh-mono bh-countdown-clock">{left > 0 ? clock(left) : "closing"}</span>
      </div>
      <div className="bh-countdown-track">
        <div className="bh-countdown-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PrizeCard({ event }: { event: BountyEvent | null }) {
  const prize = event?.prize;
  if (!prize || (!prize.title && !prize.imageUrl)) return null;
  return (
    <motion.div variants={riseItem} className="bh-card bh-prize">
      <div className="bh-prize-inner">
        {prize.imageUrl ? (
          <div className="bh-prize-art">
            <img src={prize.imageUrl} alt={prize.title ?? "Grand prize"} referrerPolicy="no-referrer" />
            <div className="bh-prize-sheen" />
          </div>
        ) : null}
        <div className="bh-prize-text">
          <span className="bh-kicker" style={{ color: "var(--accent)" }}>Grand prize</span>
          <h3 className="bh-prize-title">{prize.title ?? "To be announced"}</h3>
          {prize.body ? <p className="bh-prize-body">{prize.body}</p> : null}
        </div>
      </div>
    </motion.div>
  );
}

function Hero({ state, me, now, onEnter, entering }: { state: PublicState; me: MeState | null; now: number; onEnter: () => void; entering: boolean }) {
  const event = state.event;
  const joined = me?.signedUp ?? false;
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-hero">
      <div className="bh-hero-main">
        <div className="bh-hero-rings" aria-hidden>
          <Crosshair size={340} className="bh-ring-far" />
          <Crosshair size={200} className="bh-ring-near" />
        </div>
        <span className="bh-kicker bh-hero-kicker">MCWV Bounty Hunt</span>
        <h1 className="bh-hero-title">
          Beat <em>one</em> of <em>two</em>.
        </h1>
        <p className="bh-hero-sub">
          Every hour of the war you are secretly given two targets.
          Out-grind at least one of them on PPH to survive the round.
          Tie and you are out. Nobody sees who is hunting them.
        </p>
        <div className="bh-hero-status">
          <StatusPill event={event} now={now} />
          {event?.status === "signup" && !joined ? (
            <button type="button" className="bh-btn bh-btn-primary" onClick={onEnter} disabled={entering}>
              {entering ? "Entering..." : "Enter the hunt"}
            </button>
          ) : null}
          {event?.status === "signup" && joined ? (
            <Chip tone="ahead">You are in</Chip>
          ) : null}
        </div>
        {event?.status === "active" ? <CountdownBar event={event} now={now} /> : null}
      </div>
      <PrizeCard event={event} />
    </motion.section>
  );
}

/* ============================== stat strip ============================== */

function StatStrip({ event }: { event: BountyEvent }) {
  const stats = [
    { label: "Round", value: event.roundCount, show: event.status === "active" },
    { label: "Still hunting", value: event.aliveCount },
    { label: "Eliminated", value: event.eliminatedCount },
    { label: "Hunters", value: event.entrantsCount },
  ].filter((s) => s.show !== false);
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-stats">
      {stats.map((s, i) => (
        <div key={s.label} className={`bh-stat ${i > 0 ? "bh-stat-divided" : ""}`}>
          <span className="bh-label">{s.label}</span>
          <span className="bh-mono bh-stat-value">
            <FlowNumber value={s.value} />
          </span>
        </div>
      ))}
    </motion.section>
  );
}

/* ============================== signup ============================== */

function SignupCard({
  state,
  me,
  onEnter,
  entering,
  needLogin,
}: {
  state: PublicState;
  me: MeState | null;
  onEnter: () => void;
  entering: boolean;
  needLogin: boolean;
}) {
  const event = state.event;
  if (!event || event.status !== "signup") return null;
  const cap = event.signupCap;
  const count = event.entrantsCount;
  const pct = Math.min(100, (count / Math.max(1, cap)) * 100);
  const joined = me?.signedUp ?? false;
  const linked = me ? me.robloxId !== null && me.robloxId !== undefined : false;

  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-signup">
      <div className="bh-signup-head">
        <div>
          <span className="bh-kicker" style={{ color: "var(--accent)" }}>Sign-ups</span>
          <h2 className="bh-section-title">The hunt starts with the war</h2>
          <p className="bh-section-sub">
            Sign up any time before the war. The board stays live right here,
            and rounds begin automatically when the next war starts.
            You need a linked Roblox account - your war PPH is your weapon.
          </p>
        </div>
        {needLogin ? (
          <a className="bh-btn bh-btn-primary" href="/login?next=/bounty">Sign in to enter</a>
        ) : !joined ? (
          linked ? (
            <button type="button" className="bh-btn bh-btn-primary" onClick={onEnter} disabled={entering}>
              {entering ? "Entering..." : "Enter the hunt"}
            </button>
          ) : (
            <a className="bh-btn" href="/profile">Link Roblox account</a>
          )
        ) : (
          <Chip tone="ahead">You are in - hunter {count} of {cap}</Chip>
        )}
      </div>
      <div className="bh-capbar">
        <div className="bh-capbar-top">
          <span className="bh-label">{count} signed up</span>
          <span className="bh-label">cap {cap}</span>
        </div>
        <div className="bh-capbar-track">
          <motion.div
            className="bh-capbar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ ...SPRING, damping: 26 }}
          />
        </div>
      </div>
    </motion.section>
  );
}

/* ============================== your hunt ============================== */

function DuelBar({ you, them }: { you: number | null; them: number | null }) {
  const ready = you !== null && them !== null;
  const max = Math.max(you ?? 0, them ?? 0, 1);
  const youPct = ready ? Math.max(2, (you! / max) * 100) : 0;
  const themPct = ready ? Math.max(2, (them! / max) * 100) : 0;
  return (
    <div className="bh-duel">
      <div className="bh-duel-row">
        <span className="bh-label bh-duel-side">You</span>
        <div className="bh-duel-track">
          <motion.div className="bh-duel-fill bh-duel-you" animate={{ width: `${youPct}%` }} transition={{ duration: 0.6 }} />
        </div>
        <span className="bh-mono bh-duel-num">{ready ? formatCompact(you!) : "-"}</span>
      </div>
      <div className="bh-duel-row">
        <span className="bh-label bh-duel-side">Them</span>
        <div className="bh-duel-track">
          <motion.div className="bh-duel-fill bh-duel-them" animate={{ width: `${themPct}%` }} transition={{ duration: 0.6 }} />
        </div>
        <span className="bh-mono bh-duel-num">{ready ? formatCompact(them!) : "-"}</span>
      </div>
      {!ready ? <p className="bh-duel-note">Live scores appear once the first checkpoint lands</p> : null}
    </div>
  );
}

function TargetCard({
  index,
  target,
  you,
}: {
  index: number;
  target: MeState["targets"][number];
  you: { roundGain: number | null } | null;
}) {
  const myGain = you?.roundGain ?? null;
  const theirGain = target.roundGain;
  let tone: "ahead" | "behind" | "tied" = "tied";
  if (myGain !== null && theirGain !== null) tone = myGain > theirGain ? "ahead" : myGain < theirGain ? "behind" : "tied";
  return (
    <motion.div variants={riseItem} className="bh-card bh-target">
      <div className="bh-target-head">
        <span className="bh-mono bh-target-index">TARGET {String(index + 1).padStart(2, "0")}</span>
        <Chip tone={tone}>{tone === "ahead" ? "You are ahead" : tone === "behind" ? "You are behind" : "Level"}</Chip>
      </div>
      <div className="bh-target-id">
        <div className="bh-target-avatar">
          <Avatar src={target.avatarUrl} name={target.username} size={56} />
          <Crosshair size={120} className="bh-target-ring" />
        </div>
        <div className="bh-target-name">
          <h3>{target.username}</h3>
          {target.lastPph !== null ? (
            <span className="bh-label">Last round: <span className="bh-mono">{formatCompact(target.lastPph)}</span> PPH</span>
          ) : (
            <span className="bh-label">No scored round yet</span>
          )}
        </div>
      </div>
      <div className="bh-target-gain">
        <span className="bh-label">Points this round</span>
        <span className="bh-mono bh-target-gain-value">
          {target.roundGain === null ? "-" : <FlowNumber value={target.roundGain} format={{ notation: "standard" }} />}
        </span>
      </div>
      <DuelBar you={myGain} them={theirGain} />
    </motion.div>
  );
}

function YourHunt({ me, now }: { me: MeState; now: number }) {
  const you = me.you;
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-hunt">
      <div className="bh-hunt-head">
        <div className="bh-hunt-you">
          <span className="bh-kicker" style={{ color: "var(--primary)" }}>Your hunt</span>
          <h2 className="bh-section-title">Round {me.roundNo ?? "?"} - beat at least one</h2>
          <p className="bh-section-sub">
            {you?.roundGain !== null && you?.roundGain !== undefined ? (
              <>You have gained <span className="bh-mono bh-hunt-gain">{formatCompact(you.roundGain)}</span> points since the last checkpoint.</>
            ) : (
              "Your live score appears after the first checkpoint of this round."
            )}
          </p>
        </div>
        {you?.lastPph ? (
          <div className="bh-card bh-you-pph">
            <span className="bh-label">Your last round PPH</span>
            <span className="bh-mono bh-stat-value"><FlowNumber value={you.lastPph} /></span>
          </div>
        ) : null}
      </div>
      <div className="bh-targets">
        {me.targets.map((t, i) => (
          <TargetCard key={t.robloxId} index={i} target={t} you={you} />
        ))}
        {me.targets.length === 0 ? (
          <div className="bh-card bh-target-empty">
            <p className="bh-section-sub">Targets for this round are being drawn. Check back in a minute.</p>
          </div>
        ) : null}
      </div>
      <p className="bh-hint">Targets, hunters and scores are private to you. The next checkpoint closes {me.roundNo ? "when the hourly card drops" : "soon"}.</p>
    </motion.section>
  );
}

function EliminatedBanner({ me }: { me: MeState }) {
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-eliminated">
      <div className="bh-eliminated-inner">
        <span className="bh-kicker" style={{ color: BEHIND }}>Eliminated</span>
        <h2 className="bh-section-title">You went down in round {me.eliminatedRound ?? "?"}</h2>
        <p className="bh-section-sub">
          The kill feed remembers you. A staff officer can still revive you before the hunt ends.
        </p>
      </div>
    </motion.section>
  );
}

/* ============================== the field ============================== */

function FieldGrid({ state }: { state: PublicState }) {
  const entrants = state.entrants;
  const alive = entrants.filter((e) => e.status === "alive");
  if (!entrants.length) return null;
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-field">
      <div className="bh-field-head">
        <div>
          <span className="bh-kicker" style={{ color: "var(--accent)" }}>The field</span>
          <h2 className="bh-section-title">{alive.length} still hunting</h2>
        </div>
        <span className="bh-label">{entrants.length} entered</span>
      </div>
      <div className="bh-field-grid">
        {entrants.map((e, i) => (
          <motion.div
            key={e.robloxId}
            variants={riseItem}
            transition={{ ...SPRING, delay: Math.min(0.4, i * 0.012) }}
            className={`bh-tile ${e.status === "alive" ? "bh-tile-alive" : "bh-tile-dead"}`}
            title={e.status === "alive" ? `${e.username} - hunting` : `${e.username} - out in round ${e.eliminatedRound ?? "?"}`}
          >
            <Avatar src={e.avatarUrl} name={e.username} size={44} dimmed={e.status !== "alive"} />
            {e.status !== "alive" ? <span className="bh-tile-x" aria-hidden>×</span> : null}
            {e.status !== "alive" && e.eliminatedRound ? <span className="bh-mono bh-tile-round">R{e.eliminatedRound}</span> : null}
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

/* ============================== kill feed ============================== */

function KillFeed({ state, now }: { state: PublicState; now: number }) {
  const rows = useMemo(() => {
    const eliminations = state.feed.map((f) => ({ kind: "kill" as const, round: f.round ?? 0, f }));
    const voids = state.rounds
      .filter((r) => r.voided && r.note)
      .map((r) => ({ kind: "void" as const, round: r.roundNo, r }));
    return [...eliminations, ...voids].sort((a, b) => b.round - a.round).slice(0, 80);
  }, [state]);

  if (!rows.length) return null;

  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-feed">
      <div className="bh-feed-head">
        <div>
          <span className="bh-kicker" style={{ color: BEHIND }}>Kill feed</span>
          <h2 className="bh-section-title">{state.feed.length} eliminated</h2>
        </div>
        <span className="bh-label">Newest first</span>
      </div>
      <ol className="bh-feed-list">
        <AnimatePresence initial={false}>
          {rows.map((row) =>
            row.kind === "void" ? (
              <motion.li
                key={`void-${row.round}`}
                variants={feedRow}
                initial="hidden"
                animate="show"
                exit="exit"
                className="bh-feed-void"
              >
                <span className="bh-mono">R{row.round}</span>
                <span>{row.r.note}</span>
              </motion.li>
            ) : (
              <motion.li
                key={`kill-${row.f.robloxId}`}
                variants={feedRow}
                initial="hidden"
                animate="show"
                exit="exit"
                className="bh-feed-row"
              >
                <span className="bh-mono bh-feed-idx">{String(row.f.round ?? 0).padStart(2, "0")}</span>
                <Avatar src={row.f.avatarUrl} name={row.f.username} size={36} dimmed />
                <span className="bh-feed-name">{row.f.username}</span>
                <span className="bh-feed-lost">
                  lost to
                  {row.f.lostTo.map((l) => (
                    <span key={l.username} className="bh-feed-killer">
                      <Avatar src={l.avatarUrl} name={l.username} size={22} />
                      <span>{l.username}</span>
                    </span>
                  ))}
                </span>
                <span className="bh-feed-when bh-label">
                  R{row.f.round ?? "?"} · {timeAgo(row.f.at, now)}
                </span>
              </motion.li>
            )
          )}
        </AnimatePresence>
      </ol>
    </motion.section>
  );
}

/* ============================== rules ============================== */

const RULES = [
  { icon: "🎯", title: "Two secret targets", body: "Each round hands you two random hunters. Nobody learns who is hunting them." },
  { icon: "⚔", title: "Strictly greater", body: "Survive by beating at least one of your targets on PPH that round." },
  { icon: "🤝", title: "Ties lose", body: "Equal PPH counts as a loss for the hunter. Grind harder." },
  { icon: "⏱", title: "Hourly checkpoints", body: "Rounds close with the hourly war cards. Same numbers, no arguments." },
  { icon: "🌑", title: "Mercy hour", body: "If a round would wipe everyone, nobody falls. The hunt breathes." },
  { icon: "🏁", title: "The final duel", body: "Last two hunters face off. Higher PPH takes the crown - a tie runs it back." },
];

function RulesGrid() {
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-rules">
      <div className="bh-feed-head">
        <div>
          <span className="bh-kicker" style={{ color: "var(--accent)" }}>The rules</span>
          <h2 className="bh-section-title">Simple, brutal, fair</h2>
        </div>
      </div>
      <div className="bh-rules-grid">
        {RULES.map((r) => (
          <motion.div key={r.title} variants={riseItem} className="bh-rule">
            <span className="bh-rule-icon" aria-hidden>{r.icon}</span>
            <h3>{r.title}</h3>
            <p>{r.body}</p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

/* ============================== standings ============================== */

function Standings({ state, now }: { state: PublicState; now: number }) {
  const event = state.event;
  if (!event || (event.status !== "ended" && event.status !== "aborted")) return null;
  if (event.status === "aborted") {
    return (
      <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-eliminated">
        <span className="bh-kicker" style={{ color: BEHIND }}>Hunt stopped</span>
        <h2 className="bh-section-title">This hunt was stopped by staff</h2>
      </motion.section>
    );
  }
  const winner = event.winner;
  const rest = state.standings.filter((s) => s.finalPlace > 1);
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-standings">
      <div className="bh-feed-head">
        <div>
          <span className="bh-kicker" style={{ color: "var(--primary)" }}>Final standings</span>
          <h2 className="bh-section-title">The hunt is over</h2>
        </div>
        {event.endNote ? <span className="bh-label">{event.endNote}</span> : null}
      </div>
      {winner ? (
        <motion.div variants={riseItem} className="bh-winner">
          <div className="bh-winner-crown" aria-hidden>🏆</div>
          <div className="bh-winner-id">
            <Avatar src={winner.avatarUrl} name={winner.username} size={64} />
            <div>
              <span className="bh-kicker" style={{ color: "var(--primary)" }}>Last hunter standing</span>
              <h3 className="bh-winner-name">{winner.username}</h3>
            </div>
          </div>
        </motion.div>
      ) : null}
      {rest.length ? (
        <ol className="bh-standings-list">
          {rest.map((s) => (
            <motion.li key={s.robloxId} variants={riseItem} className="bh-standing">
              <span className="bh-mono bh-standing-place">{s.finalPlace}</span>
              <Avatar src={s.avatarUrl} name={s.username} size={32} dimmed />
              <span className="bh-standing-name">{s.username}</span>
              {s.eliminatedRound ? <span className="bh-label">out in R{s.eliminatedRound}</span> : <Chip tone="ahead">survived</Chip>}
            </motion.li>
          ))}
        </ol>
      ) : null}
    </motion.section>
  );
}

/* ============================== admin ============================== */

function AdminPanel({
  admin,
  refreshAll,
  toast,
}: {
  admin: AdminState | null;
  refreshAll: () => void;
  toast: (msg: string, tone: "ok" | "err") => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState("75");
  const [battleId, setBattleId] = useState("");
  const [prizeTitle, setPrizeTitle] = useState("");
  const [prizeBody, setPrizeBody] = useState("");
  const [prizeUrl, setPrizeUrl] = useState("");
  const [reviveId, setReviveId] = useState("");

  useEffect(() => {
    if (admin?.event) {
      setCap(String(admin.event.signupCap ?? 75));
      setBattleId(admin.event.battleId ?? "");
      setPrizeTitle(admin.event.prize.title ?? "");
      setPrizeBody(admin.event.prize.body ?? "");
      setPrizeUrl(admin.event.prize.imageUrl ?? "");
    } else {
      // No event yet: default to "Next war (auto)" - the engine attaches the
      // live battle the moment a war starts. Officers can still pick a
      // specific battle from the list if they ever need to.
      setBattleId("");
    }
  }, [admin]);

  const post = useCallback(
    async (payload: Record<string, unknown>, okMsg: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/bounty/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        const json = await res.json();
        if (!json.success) {
          toast(json.error ?? "Action failed", "err");
          return null;
        }
        toast(okMsg, "ok");
        refreshAll();
        return json;
      } catch {
        toast("Action failed", "err");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refreshAll, toast]
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (file.size > 2 * 1024 * 1024) {
        toast("Image must be under 2MB", "err");
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      }).catch(() => "");
      if (!dataUrl) {
        toast("Could not read that file", "err");
        return;
      }
      const res = await post({ action: "upload_prize_image", data_url: dataUrl }, "Prize image uploaded");
      if (res?.url) setPrizeUrl(res.url);
    },
    [post, toast]
  );

  const ev = admin?.event ?? null;

  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-card bh-admin">
      <button type="button" className="bh-admin-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="bh-kicker" style={{ color: "var(--accent)" }}>Officer controls</span>
        <span className="bh-admin-toggle-right">
          {ev ? (
            <span className="bh-label">
              {ev.status === "signup" ? `Sign-ups - ${ev.entrantsCount}/${ev.signupCap}` : ev.status === "active" ? `Live - round ${ev.roundCount}` : `Event #${ev.id} - ${ev.status}`}
            </span>
          ) : null}
          <span className={`bh-chevron ${open ? "bh-chevron-open" : ""}`} aria-hidden>▾</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bh-admin-body"
          >
            {!ev ? (
              <div className="bh-admin-block">
                <h3 className="bh-admin-h">Create the hunt</h3>
                <div className="bh-form-grid">
                  <label className="bh-field">
                    <span className="bh-label">Battle</span>
                    <select value={battleId} onChange={(e) => setBattleId(e.target.value)} className="bh-input">
                      <option value="">Next war (auto)</option>
                      {(admin?.battles ?? []).map((b) => (
                        <option key={b.battleId} value={b.battleId}>
                          {(b.active ? "LIVE - " : b.upcoming ? "Upcoming - " : "Past - ") + (b.battleName ?? b.battleId)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="bh-field">
                    <span className="bh-label">Sign-up cap</span>
                    <input className="bh-input bh-mono" value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" />
                  </label>
                </div>
                <div className="bh-form-grid">
                  <label className="bh-field">
                    <span className="bh-label">Prize title</span>
                    <input className="bh-input" value={prizeTitle} onChange={(e) => setPrizeTitle(e.target.value)} placeholder="Titanic Koi Fish" />
                  </label>
                </div>
                <label className="bh-field">
                  <span className="bh-label">Prize description</span>
                  <textarea className="bh-input" rows={2} value={prizeBody} onChange={(e) => setPrizeBody(e.target.value)} placeholder="Awarded in-game by staff after the hunt." />
                </label>
                <div className="bh-field">
                  <span className="bh-label">Prize image</span>
                  <div className="bh-upload-row">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="bh-input bh-input-file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadImage(f);
                      }}
                    />
                    {prizeUrl ? <img src={prizeUrl} alt="Prize preview" className="bh-upload-preview" referrerPolicy="no-referrer" /> : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="bh-btn bh-btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void post(
                      { action: "create", battle_id: battleId || undefined, signup_cap: Number(cap) || 75, prize_title: prizeTitle || null, prize_body: prizeBody || null, prize_image_url: prizeUrl || null },
                      "Hunt created - sign-ups are open"
                    )
                  }
                >
                  Create hunt
                </button>
              </div>
            ) : (
              <>
                <div className="bh-admin-block">
                  <h3 className="bh-admin-h">Event #{ev.id} - {ev.status}</h3>
                  <div className="bh-admin-actions">
                    {ev.status === "signup" ? (
                      <>
                        <button
                          type="button"
                          className="bh-btn bh-btn-primary"
                          disabled={busy || ev.entrantsCount < 3}
                          onClick={() => {
                            if (window.confirm(`Start the hunt with ${ev.entrantsCount} hunters? Sign-ups close and targets go out.`)) {
                              void post({ action: "start" }, "The hunt is live - targets are out");
                            }
                          }}
                        >
                          Start hunt ({ev.entrantsCount} hunters)
                        </button>
                        <button
                          type="button"
                          className="bh-btn"
                          disabled={busy}
                          onClick={() => void post({ action: "set_cap", signup_cap: Number(cap) || 75 }, "Cap updated")}
                        >
                          Set cap to {Number(cap) || 75}
                        </button>
                      </>
                    ) : null}
                    {ev.status === "active" && (admin?.eliminated?.length ?? 0) > 0 ? (
                      <div className="bh-revive-row">
                        <select value={reviveId} onChange={(e) => setReviveId(e.target.value)} className="bh-input">
                          <option value="">Revive a hunter...</option>
                          {(admin?.eliminated ?? []).map((x) => (
                            <option key={x.robloxId} value={x.robloxId}>
                              {x.username} (out R{x.eliminatedRound ?? "?"})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="bh-btn"
                          disabled={busy || !reviveId}
                          onClick={() => {
                            if (reviveId) void post({ action: "revive", roblox_id: reviveId }, "Hunter revived - they re-enter next round");
                          }}
                        >
                          Revive
                        </button>
                      </div>
                    ) : null}
                    {ev.status === "signup" || ev.status === "active" ? (
                      <button
                        type="button"
                        className="bh-btn bh-btn-danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Abort the hunt? The board freezes and everyone can see it was stopped.")) {
                            void post({ action: "abort" }, "Hunt stopped");
                          }
                        }}
                      >
                        Abort hunt
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="bh-admin-block">
                  <h3 className="bh-admin-h">Prize</h3>
                  <div className="bh-form-grid">
                    <label className="bh-field">
                      <span className="bh-label">Title</span>
                      <input className="bh-input" value={prizeTitle} onChange={(e) => setPrizeTitle(e.target.value)} />
                    </label>
                  </div>
                  <label className="bh-field">
                    <span className="bh-label">Description</span>
                    <textarea className="bh-input" rows={2} value={prizeBody} onChange={(e) => setPrizeBody(e.target.value)} />
                  </label>
                  <div className="bh-field">
                    <span className="bh-label">Image</span>
                    <div className="bh-upload-row">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="bh-input bh-input-file"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadImage(f);
                        }}
                      />
                      {prizeUrl ? <img src={prizeUrl} alt="Prize preview" className="bh-upload-preview" referrerPolicy="no-referrer" /> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bh-btn bh-btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void post(
                        { action: "update_prize", prize_title: prizeTitle || null, prize_body: prizeBody || null, prize_image_url: prizeUrl || null },
                        "Prize updated"
                      )
                    }
                  >
                    Save prize
                  </button>
                </div>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

/* ============================== toast ============================== */

type ToastMsg = { id: number; msg: string; tone: "ok" | "err" };

function Toasts({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div className="bh-toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={SPRING}
            className={`bh-toast ${t.tone === "err" ? "bh-toast-err" : ""}`}
            role="status"
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ============================== motion variants ============================== */

const riseItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING },
};

const riseList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const feedRow = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.28 } },
  exit: { opacity: 0, x: 6 },
};

const Z_TIED = "#a1a1aa";

/* ============================== page ============================== */

export default function BountyPage() {
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [entering, setEntering] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastSeq = useRef(0);

  const toast = useCallback((msg: string, tone: "ok" | "err") => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const loadPublic = useCallback(async () => {
    try {
      const res = await fetch("/api/bounty", { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setState(json as PublicState);
        setLoadError(false);
      } else setLoadError(true);
    } catch {
      setLoadError(true);
    }
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/bounty/me", { cache: "no-store" });
      if (res.status === 401) {
        setNeedLogin(true);
        setMe(null);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setNeedLogin(false);
        setMe(json as MeState);
      }
    } catch {
      /* keep the last good state */
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await fetch("/api/bounty/admin", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setAdmin(json as AdminState);
    } catch {
      /* officer panel is best-effort */
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadPublic();
    void loadMe();
    void loadAdmin();
  }, [loadPublic, loadMe, loadAdmin]);

  useEffect(() => {
    void loadPublic();
    void loadMe();
  }, [loadPublic, loadMe]);

  // Officers pull the control panel once the role is known.
  useEffect(() => {
    if (me?.role === "officer" || me?.role === "owner") void loadAdmin();
  }, [me?.role, loadAdmin]);

  // Poll while the tab is visible; refresh on focus.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) {
        void loadPublic();
        void loadMe();
      }
    };
    const id = window.setInterval(tick, POLL_ME_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadPublic, loadMe]);

  // 1s heartbeat for countdown + "x ago" labels.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = "Bounty Hunt - MCWV Hub";
  }, []);

  const onEnter = useCallback(async () => {
    if (needLogin) {
      window.location.href = "/login?next=/bounty";
      return;
    }
    setEntering(true);
    try {
      const res = await fetch("/api/bounty/signup", { method: "POST", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login?next=/bounty";
        return;
      }
      const json = await res.json();
      if (json.success) {
        toast(json.alreadyIn ? "You are already in" : `You are in - hunter ${json.entrantsCount} of the field`, "ok");
        refreshAll();
      } else {
        toast(json.error ?? "Could not join", "err");
      }
    } catch {
      toast("Could not join right now", "err");
    } finally {
      setEntering(false);
    }
  }, [needLogin, refreshAll, toast]);

  const event = state?.event ?? null;
  const isOfficer = me?.role === "officer" || me?.role === "owner";
  const showYourHunt =
    event?.status === "active" && me?.signedUp === true && me?.status === "alive";
  const showEliminated =
    me?.signedUp === true && me?.status === "eliminated" && event?.status === "active";

  return (
    <MotionConfig reducedMotion="user">
      <div className="bh-page">
        <Navbar />
        <main className="bh-wrap">
          {loadError && !state ? (
            <div className="bh-card bh-eliminated">
              <span className="bh-kicker" style={{ color: BEHIND }}>Connection lost</span>
              <h2 className="bh-section-title">Could not reach the hunt board</h2>
              <button type="button" className="bh-btn bh-btn-primary" onClick={() => void loadPublic()}>Try again</button>
            </div>
          ) : !state ? (
            <BountySkeleton />
          ) : !event ? (
            <TeaserHero now={now} />
          ) : (
            <>
              <Hero state={state} me={me} now={now} onEnter={() => void onEnter()} entering={entering} />
              <StatStrip event={event} />
              <SignupCard state={state} me={me} onEnter={() => void onEnter()} entering={entering} needLogin={needLogin} />
              {showYourHunt && me ? <YourHunt me={me} now={now} /> : null}
              {showEliminated && me ? <EliminatedBanner me={me} /> : null}
              <Standings state={state} now={now} />
              <FieldGrid state={state} />
              <KillFeed state={state} now={now} />
              <RulesGrid />
            </>
          )}
          {isOfficer ? <AdminPanel admin={admin} refreshAll={refreshAll} toast={toast} /> : null}
          <footer className="bh-footer">
            <span className="bh-label">
              Scored from the official hourly war snapshots · Board refreshes every {POLL_ME_MS / 1000}s
              {state?.updatedAt ? ` · Updated ${timeAgo(state.updatedAt, now)}` : ""}
            </span>
          </footer>
        </main>
        <Toasts toasts={toasts} />
        <style jsx global>{`
          /* ============ Bounty Hunt design system ============ */
          .bh-page {
            min-height: 100vh;
            background:
              radial-gradient(1100px 500px at 85% -10%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%),
              radial-gradient(900px 480px at 0% 0%, color-mix(in srgb, var(--primary) 6%, transparent), transparent 70%),
              var(--background);
            color: var(--foreground);
          }
          .bh-wrap {
            max-width: 72rem;
            margin: 0 auto;
            padding: 1.5rem 1rem 4rem;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }
          .bh-mono {
            font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace;
            font-variant-numeric: tabular-nums;
          }
          .bh-label {
            font-size: 0.68rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: color-mix(in srgb, var(--foreground) 55%, transparent);
            font-weight: 600;
          }
          .bh-kicker {
            font-size: 0.7rem;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            font-weight: 700;
          }
          .bh-card {
            position: relative;
            border-radius: 20px;
            border: 1px solid var(--border);
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--foreground) 3%, transparent), transparent 55%),
              var(--card);
            box-shadow:
              inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 6%, transparent),
              0 20px 45px -22px rgba(0, 0, 0, 0.65);
            padding: 1.25rem;
          }
          .bh-section-title {
            font-size: 1.15rem;
            font-weight: 800;
            letter-spacing: -0.01em;
            margin-top: 0.2rem;
          }
          .bh-section-sub {
            font-size: 0.85rem;
            color: color-mix(in srgb, var(--foreground) 62%, transparent);
            margin-top: 0.35rem;
            max-width: 46rem;
            line-height: 1.5;
          }
          .bh-hint {
            font-size: 0.75rem;
            color: color-mix(in srgb, var(--foreground) 45%, transparent);
            margin-top: 0.75rem;
          }

          /* ---------- hero ---------- */
          .bh-hero {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1.25rem;
          }
          .bh-hero-main {
            position: relative;
            padding: 2.5rem 1.5rem 2rem;
            border-radius: 24px;
            border: 1px solid var(--border);
            overflow: hidden;
            background:
              linear-gradient(160deg, color-mix(in srgb, var(--primary) 9%, transparent), transparent 45%),
              linear-gradient(180deg, color-mix(in srgb, var(--foreground) 3%, transparent), transparent 60%),
              var(--card);
            box-shadow:
              inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 7%, transparent),
              0 30px 60px -30px rgba(0, 0, 0, 0.7);
          }
          .bh-hero-rings {
            position: absolute;
            right: -70px;
            top: -70px;
            width: 380px;
            height: 380px;
            pointer-events: none;
          }
          .bh-ring-far {
            position: absolute;
            right: 0;
            top: 0;
            color: var(--primary);
            opacity: 0.14;
            animation: bh-spin 90s linear infinite;
          }
          .bh-ring-near {
            position: absolute;
            right: 80px;
            top: 90px;
            color: var(--accent);
            opacity: 0.2;
            animation: bh-spin 60s linear infinite reverse;
          }
          .bh-hero-kicker {
            color: var(--accent);
            position: relative;
          }
          .bh-hero-title {
            position: relative;
            font-size: clamp(2.7rem, 7.5vw, 5rem);
            font-weight: 800;
            letter-spacing: -0.035em;
            line-height: 0.98;
            margin: 0.75rem 0 0;
            text-wrap: balance;
          }
          .bh-hero-title em {
            font-style: normal;
            background: linear-gradient(100deg, var(--primary), var(--accent));
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-shadow: none;
            filter: drop-shadow(0 0 26px color-mix(in srgb, var(--primary) 35%, transparent));
          }
          .bh-hero-sub {
            position: relative;
            font-size: 0.95rem;
            line-height: 1.55;
            color: color-mix(in srgb, var(--foreground) 68%, transparent);
            max-width: 34rem;
            margin-top: 1rem;
          }
          .bh-hero-status {
            position: relative;
            display: flex;
            align-items: center;
            gap: 0.9rem;
            flex-wrap: wrap;
            margin-top: 1.4rem;
          }

          /* ---------- chips + buttons ---------- */
          .bh-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.04em;
            border-radius: 999px;
            border: 1px solid;
            padding: 0.32rem 0.75rem;
            line-height: 1;
          }
          .bh-chip-live {
            animation: bh-breathe 2.8s ease-in-out infinite;
          }
          .bh-dot {
            width: 7px;
            height: 7px;
            border-radius: 999px;
            display: inline-block;
          }
          .bh-dot-pulse {
            animation: bh-pulse 1.8s ease-in-out infinite;
          }
          .bh-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.4rem;
            font-weight: 700;
            font-size: 0.85rem;
            padding: 0.6rem 1.15rem;
            border-radius: 14px;
            border: 1px solid var(--border);
            background: color-mix(in srgb, var(--foreground) 6%, transparent);
            color: var(--foreground);
            cursor: pointer;
            text-decoration: none;
            transition: transform 0.18s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.18s, border-color 0.18s, background 0.18s;
          }
          .bh-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
          }
          .bh-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .bh-btn-primary {
            background: linear-gradient(120deg, var(--primary), color-mix(in srgb, var(--accent) 60%, var(--primary)));
            color: #06120c;
            border-color: transparent;
            box-shadow: 0 10px 30px -12px var(--glow);
          }
          .bh-btn-primary:hover:not(:disabled) {
            box-shadow: 0 14px 34px -12px var(--glow);
          }
          .bh-btn-danger {
            border-color: color-mix(in srgb, #ef4444 45%, var(--border));
            color: #fca5a5;
          }

          /* ---------- countdown ---------- */
          .bh-countdown {
            margin-top: 1.25rem;
            max-width: 22rem;
          }
          .bh-countdown-top {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 0.35rem;
          }
          .bh-countdown-clock {
            font-size: 1.4rem;
            font-weight: 700;
          }
          .bh-countdown-track {
            height: 5px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--foreground) 10%, transparent);
            overflow: hidden;
          }
          .bh-countdown-fill {
            height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--primary), var(--accent));
            transition: width 1s linear;
          }

          /* ---------- prize ---------- */
          .bh-prize {
            display: flex;
            align-items: center;
            overflow: hidden;
          }
          .bh-prize-inner {
            display: flex;
            gap: 1rem;
            align-items: center;
            width: 100%;
          }
          .bh-prize-art {
            position: relative;
            width: 108px;
            height: 108px;
            flex: none;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid var(--border);
            background: color-mix(in srgb, var(--foreground) 5%, transparent);
          }
          .bh-prize-art img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .bh-prize-sheen {
            position: absolute;
            inset: 0;
            background: linear-gradient(115deg, transparent 30%, color-mix(in srgb, var(--foreground) 22%, transparent) 48%, transparent 62%);
            transform: translateX(-120%);
            animation: bh-sheen 3.8s ease-in-out infinite;
          }
          .bh-prize-title {
            font-size: 1.2rem;
            font-weight: 800;
            margin-top: 0.25rem;
            letter-spacing: -0.01em;
          }
          .bh-prize-body {
            font-size: 0.82rem;
            color: color-mix(in srgb, var(--foreground) 62%, transparent);
            margin-top: 0.3rem;
            line-height: 1.45;
          }

          /* ---------- stats ---------- */
          .bh-stats {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: 1fr;
            gap: 0;
            padding: 0.9rem 0.5rem;
          }
          .bh-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.25rem;
            padding: 0.35rem 0.5rem;
          }
          .bh-stat-divided {
            border-left: 1px solid var(--border);
          }
          .bh-stat-value {
            font-size: 1.6rem;
            font-weight: 800;
            letter-spacing: -0.02em;
          }

          /* ---------- signup ---------- */
          .bh-signup-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            flex-wrap: wrap;
          }
          .bh-capbar {
            margin-top: 1rem;
          }
          .bh-capbar-top {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.35rem;
          }
          .bh-capbar-track {
            height: 8px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--foreground) 10%, transparent);
            overflow: hidden;
          }
          .bh-capbar-fill {
            height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--primary), var(--accent));
          }

          /* ---------- your hunt ---------- */
          .bh-hunt-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            flex-wrap: wrap;
          }
          .bh-you-pph {
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
            align-items: flex-end;
            padding: 0.85rem 1.1rem;
          }
          .bh-hunt-gain {
            font-weight: 800;
          }
          .bh-targets {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            margin-top: 1.1rem;
          }
          .bh-target {
            display: flex;
            flex-direction: column;
            gap: 0.9rem;
          }
          .bh-target-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .bh-target-index {
            font-size: 0.7rem;
            letter-spacing: 0.16em;
            color: color-mix(in srgb, var(--foreground) 50%, transparent);
            font-weight: 700;
          }
          .bh-target-id {
            display: flex;
            gap: 0.9rem;
            align-items: center;
          }
          .bh-target-avatar {
            position: relative;
            width: 56px;
            height: 56px;
            flex: none;
          }
          .bh-target-avatar .bh-avatar {
            border-radius: 999px;
            overflow: hidden;
          }
          .bh-target-ring {
            position: absolute;
            inset: -32px;
            left: -32px;
            top: -32px;
            color: var(--accent);
            opacity: 0.35;
            transition: opacity 0.3s;
          }
          .bh-target:hover .bh-target-ring {
            opacity: 0.7;
            animation: bh-spin 12s linear infinite;
          }
          .bh-target-name h3 {
            font-size: 1.05rem;
            font-weight: 800;
            letter-spacing: -0.01em;
          }
          .bh-target-gain {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
          }
          .bh-target-gain-value {
            font-size: 1.35rem;
            font-weight: 800;
          }
          .bh-target-empty {
            grid-column: 1 / -1;
          }
          .bh-duel {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
          }
          .bh-duel-row {
            display: grid;
            grid-template-columns: 2.6rem 1fr 4.5rem;
            gap: 0.6rem;
            align-items: center;
          }
          .bh-duel-side {
            text-align: left;
          }
          .bh-duel-track {
            height: 7px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--foreground) 9%, transparent);
            overflow: hidden;
          }
          .bh-duel-fill {
            height: 100%;
            border-radius: 999px;
          }
          .bh-duel-you {
            background: var(--primary);
            box-shadow: 0 0 14px -2px var(--glow);
          }
          .bh-duel-them {
            background: color-mix(in srgb, var(--foreground) 38%, transparent);
          }
          .bh-duel-num {
            font-size: 0.78rem;
            font-weight: 700;
            text-align: right;
          }
          .bh-duel-note {
            font-size: 0.72rem;
            color: color-mix(in srgb, var(--foreground) 45%, transparent);
          }

          /* ---------- eliminated ---------- */
          .bh-eliminated {
            border-color: color-mix(in srgb, #ef4444 35%, var(--border));
            background:
              linear-gradient(180deg, color-mix(in srgb, #ef4444 8%, transparent), transparent 60%),
              var(--card);
          }

          /* ---------- field ---------- */
          .bh-field-head,
          .bh-feed-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 0.9rem;
          }
          .bh-field-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
            gap: 0.5rem;
          }
          .bh-tile {
            position: relative;
            aspect-ratio: 1;
            border-radius: 14px;
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .bh-tile-alive {
            border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
            box-shadow: 0 0 16px -6px var(--glow);
            animation: bh-breathe 5s ease-in-out infinite;
          }
          .bh-tile-dead {
            opacity: 0.55;
          }
          .bh-tile-x {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.7rem;
            font-weight: 800;
            color: #ef4444;
            text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
          }
          .bh-tile-round {
            position: absolute;
            right: 3px;
            bottom: 2px;
            font-size: 0.55rem;
            font-weight: 700;
            color: #fca5a5;
          }
          .bh-avatar {
            border-radius: 12px;
            object-fit: cover;
            flex: none;
          }
          .bh-avatar-dead {
            filter: grayscale(1);
            opacity: 0.75;
          }
          .bh-initials {
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--primary) 16%, color-mix(in srgb, var(--foreground) 8%, transparent));
            font-weight: 800;
            font-size: 0.9em;
            color: var(--foreground);
            border-radius: 12px;
          }

          /* ---------- kill feed ---------- */
          .bh-feed-list {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .bh-feed-row {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.5rem 0.65rem;
            border-radius: 14px;
            border: 1px solid transparent;
          }
          .bh-feed-row:hover {
            border-color: var(--border);
            background: color-mix(in srgb, var(--foreground) 4%, transparent);
          }
          .bh-feed-idx {
            font-size: 0.75rem;
            font-weight: 700;
            color: color-mix(in srgb, var(--foreground) 35%, transparent);
            width: 1.6rem;
            flex: none;
          }
          .bh-feed-row .bh-avatar {
            border-radius: 999px;
          }
          .bh-feed-name {
            font-weight: 700;
            font-size: 0.9rem;
            text-decoration: line-through;
            text-decoration-color: #ef4444;
            text-decoration-thickness: 2px;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 11rem;
          }
          .bh-feed-lost {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 0.78rem;
            color: color-mix(in srgb, var(--foreground) 55%, transparent);
            min-width: 0;
            flex-wrap: wrap;
          }
          .bh-feed-killer {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            font-weight: 700;
            color: var(--foreground);
          }
          .bh-feed-killer .bh-avatar {
            border-radius: 999px;
          }
          .bh-feed-when {
            margin-left: auto;
            flex: none;
          }
          .bh-feed-void {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.45rem 0.65rem;
            border-radius: 12px;
            border: 1px dashed var(--border);
            color: color-mix(in srgb, var(--foreground) 50%, transparent);
            font-size: 0.78rem;
          }
          .bh-feed-void .bh-mono {
            font-size: 0.7rem;
            font-weight: 700;
          }

          /* ---------- rules ---------- */
          .bh-rules-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
            gap: 0.75rem;
          }
          .bh-rule {
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 0.9rem;
            background: color-mix(in srgb, var(--foreground) 3%, transparent);
            transition: transform 0.18s cubic-bezier(0.23, 1, 0.32, 1), border-color 0.18s;
          }
          .bh-rule:hover {
            transform: translateY(-2px);
            border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
          }
          .bh-rule-icon {
            font-size: 1.15rem;
          }
          .bh-rule h3 {
            font-size: 0.9rem;
            font-weight: 800;
            margin-top: 0.4rem;
          }
          .bh-rule p {
            font-size: 0.78rem;
            line-height: 1.45;
            color: color-mix(in srgb, var(--foreground) 60%, transparent);
            margin-top: 0.25rem;
          }

          /* ---------- standings ---------- */
          .bh-winner {
            display: flex;
            align-items: center;
            gap: 1rem;
            border: 1px solid color-mix(in srgb, var(--primary) 45%, var(--border));
            border-radius: 18px;
            padding: 1.1rem;
            background:
              radial-gradient(400px 120px at 10% 0%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 70%),
              color-mix(in srgb, var(--foreground) 3%, transparent);
            box-shadow: 0 0 40px -18px var(--glow);
          }
          .bh-winner-crown {
            font-size: 2rem;
            filter: drop-shadow(0 0 14px color-mix(in srgb, var(--primary) 50%, transparent));
          }
          .bh-winner-id {
            display: flex;
            align-items: center;
            gap: 0.9rem;
          }
          .bh-winner-id .bh-avatar {
            border-radius: 999px;
          }
          .bh-winner-name {
            font-size: 1.3rem;
            font-weight: 800;
            letter-spacing: -0.01em;
          }
          .bh-standings-list {
            list-style: none;
            margin: 0.9rem 0 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
          }
          .bh-standing {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.4rem 0.5rem;
            border-radius: 12px;
          }
          .bh-standing:hover {
            background: color-mix(in srgb, var(--foreground) 4%, transparent);
          }
          .bh-standing .bh-avatar {
            border-radius: 999px;
          }
          .bh-standing-place {
            width: 2rem;
            font-weight: 800;
            color: color-mix(in srgb, var(--foreground) 55%, transparent);
          }
          .bh-standing-name {
            font-weight: 700;
            font-size: 0.9rem;
          }

          /* ---------- admin ---------- */
          .bh-admin-toggle {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            background: none;
            border: none;
            cursor: pointer;
            color: inherit;
            padding: 0;
          }
          .bh-admin-toggle-right {
            display: flex;
            align-items: center;
            gap: 0.7rem;
          }
          .bh-chevron {
            transition: transform 0.25s cubic-bezier(0.23, 1, 0.32, 1);
            color: color-mix(in srgb, var(--foreground) 50%, transparent);
          }
          .bh-chevron-open {
            transform: rotate(180deg);
          }
          .bh-admin-body {
            overflow: hidden;
          }
          .bh-admin-block {
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
            padding: 1.1rem 0 0.4rem;
            border-top: 1px solid var(--border);
            margin-top: 1rem;
          }
          .bh-admin-block:first-child {
            border-top: none;
            margin-top: 0.4rem;
          }
          .bh-admin-h {
            font-size: 0.85rem;
            font-weight: 800;
            text-transform: capitalize;
          }
          .bh-admin-actions {
            display: flex;
            gap: 0.6rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .bh-form-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 0.75rem;
          }
          @media (max-width: 640px) {
            .bh-form-grid {
              grid-template-columns: 1fr;
            }
          }
          .bh-field {
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
          }
          .bh-input {
            border-radius: 12px;
            border: 1px solid var(--border);
            background: color-mix(in srgb, var(--foreground) 4%, transparent);
            color: var(--foreground);
            padding: 0.55rem 0.75rem;
            font-size: 0.85rem;
            outline: none;
            width: 100%;
          }
          .bh-input:focus {
            border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
          }
          .bh-input-file {
            padding: 0.4rem;
          }
          .bh-upload-row {
            display: flex;
            align-items: center;
            gap: 0.8rem;
          }
          .bh-upload-preview {
            width: 56px;
            height: 56px;
            border-radius: 12px;
            object-fit: cover;
            border: 1px solid var(--border);
          }
          .bh-revive-row {
            display: flex;
            gap: 0.6rem;
            flex: 1;
            min-width: 16rem;
          }

          /* ---------- toasts ---------- */
          .bh-toasts {
            position: fixed;
            right: 1rem;
            bottom: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            z-index: 60;
          }
          .bh-toast {
            border-radius: 14px;
            border: 1px solid color-mix(in srgb, #22c55e 40%, var(--border));
            background: color-mix(in srgb, #22c55e 12%, var(--background));
            color: var(--foreground);
            padding: 0.7rem 1rem;
            font-size: 0.85rem;
            font-weight: 700;
            box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.7);
          }
          .bh-toast-err {
            border-color: color-mix(in srgb, #ef4444 40%, var(--border));
            background: color-mix(in srgb, #ef4444 12%, var(--background));
          }

          /* ---------- footer / skeleton ---------- */
          .bh-footer {
            text-align: center;
            padding-top: 1rem;
          }
          .bh-skel {
            border-radius: 20px;
            border: 1px solid var(--border);
            background: color-mix(in srgb, var(--foreground) 3%, transparent);
            animation: bh-breathe 2.2s ease-in-out infinite;
          }

          /* ---------- keyframes ---------- */
          @keyframes bh-spin {
            to {
              transform: rotate(360deg);
            }
          }
          @keyframes bh-pulse {
            0%, 100% {
              box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 60%, transparent);
            }
            70% {
              box-shadow: 0 0 0 7px transparent;
            }
          }
          @keyframes bh-breathe {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.72;
            }
          }
          @keyframes bh-sheen {
            0%, 55% {
              transform: translateX(-120%);
            }
            85%, 100% {
              transform: translateX(120%);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .bh-ring-far,
            .bh-ring-near,
            .bh-dot-pulse,
            .bh-chip-live,
            .bh-prize-sheen,
            .bh-tile-alive,
            .bh-skel {
              animation: none !important;
            }
            .bh-countdown-fill {
              transition: none !important;
            }
          }

          @media (min-width: 900px) {
            .bh-hero {
              grid-template-columns: 1.6fr 1fr;
              align-items: stretch;
            }
            .bh-prize {
              align-items: stretch;
            }
            .bh-prize-inner {
              flex-direction: column;
              justify-content: center;
              text-align: left;
              gap: 0.8rem;
            }
            .bh-prize-art {
              width: 100%;
              height: 150px;
            }
          }
        `}</style>
      </div>
    </MotionConfig>
  );
}

/* ============================== skeleton + teaser ============================== */

function BountySkeleton() {
  return (
    <div className="bh-wrap" style={{ paddingTop: "1.5rem" }}>
      <div className="bh-skel" style={{ height: 260 }} />
      <div className="bh-skel" style={{ height: 84 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div className="bh-skel" style={{ height: 200 }} />
        <div className="bh-skel" style={{ height: 200 }} />
      </div>
      <div className="bh-skel" style={{ height: 320 }} />
    </div>
  );
}

function TeaserHero({ now }: { now: number }) {
  return (
    <motion.section variants={riseList} initial="hidden" animate="show" className="bh-hero">
      <div className="bh-hero-main">
        <div className="bh-hero-rings" aria-hidden>
          <Crosshair size={340} className="bh-ring-far" />
          <Crosshair size={200} className="bh-ring-near" />
        </div>
        <span className="bh-kicker bh-hero-kicker">MCWV Bounty Hunt</span>
        <h1 className="bh-hero-title">
          The hunt is <em>coming</em>.
        </h1>
        <p className="bh-hero-sub">
          Sign-ups open before the next war. Two secret targets every hour.
          Out-grind one on PPH or you are out. Last hunter standing takes the prize.
        </p>
        <div className="bh-hero-status">
          <StatusPill event={null} now={now} />
        </div>
      </div>
      <RulesInlineCard />
    </motion.section>
  );
}

function RulesInlineCard() {
  return (
    <motion.div variants={riseItem} className="bh-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <span className="bh-kicker" style={{ color: "var(--accent)" }}>How it works</span>
      <h2 className="bh-section-title">Simple, brutal, fair</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: "0.9rem 0 0", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {RULES.slice(0, 4).map((r) => (
          <li key={r.title} style={{ display: "flex", gap: "0.6rem", fontSize: "0.85rem", alignItems: "baseline" }}>
            <span aria-hidden>{r.icon}</span>
            <span><strong>{r.title}.</strong> <span style={{ opacity: 0.65 }}>{r.body}</span></span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
