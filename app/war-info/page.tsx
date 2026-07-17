"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type RewardLike = Record<string, unknown>;

type WarApiData = {
  success?: boolean;
  active: boolean;
  battleId: string | null;
  warName: string | null;
  startTime: number | string | null;
  endTime: number | string | null;
  durationSeconds: number | null;
  state: "inactive" | "upcoming" | "live" | "past" | string;
  clanRank: number | null;
  totalClans: number | null;
  totalPoints: number;
  participants: number;
  maxParticipants: number;
  progressPct: number | null;
  rewards: {
    headlineReward: RewardLike | null;
    placementRewards: RewardLike[];
    tieredRewards: Record<string, RewardLike[]> | null;
  };
};

const HERO_IMAGE_URL =
  "https://bigblog-storage.s3.us-east-1.amazonaws.com/ps99_tap_heroes_lunar_battle_2ed0302b55.png";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toMs(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDateTime(value: number | string | null) {
  const ms = toMs(value);
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatRewardValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return `${value.length} items`;
  return null;
}

function rewardSummary(reward: RewardLike | null) {
  if (!reward) return "—";

  const preferredKeys = ["name", "title", "displayName", "item", "pet", "reward", "label"];
  for (const key of preferredKeys) {
    const value = formatRewardValue(reward[key]);
    if (value) return value;
  }

  const firstString = Object.values(reward).find((v) => typeof v === "string");
  if (typeof firstString === "string") return firstString;

  return "Reward";
}

function rewardDetails(reward: RewardLike | null) {
  if (!reward) return [] as Array<{ label: string; value: string }>;

  const entries = Object.entries(reward)
    .filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "object" && !Array.isArray(value)) return Object.keys(value as object).length > 0;
      return true;
    })
    .slice(0, 4)
    .map(([key, value]) => ({
      label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "),
      value:
        typeof value === "object" && !Array.isArray(value)
          ? JSON.stringify(value)
          : String(formatRewardValue(value) ?? value),
    }));

  return entries;
}

function ProgressBar({ value }: { value: number | null }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="h-3 overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full rounded-full transition-all duration-500 animate-gradientMove gradient-bar"
          style={{
            width: `${safe}%`,
            background: "linear-gradient(90deg, var(--primary), var(--accent), var(--primary))",
            boxShadow: "0 0 20px var(--glow)",
            backgroundSize: "200% 200%",
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--foreground)]/55">
        <span>{value === null ? "—" : `${safe.toFixed(1)}% complete`}</span>
        <span>Live progress</span>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[2rem] border p-5 sm:p-6 backdrop-blur ${className}`}
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--card) 92%, transparent)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RewardCard({
  title,
  reward,
  tone = "default",
}: {
  title: string;
  reward: RewardLike | null;
  tone?: "default" | "accent";
}) {
  const details = rewardDetails(reward);

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor:
          tone === "accent"
            ? "color-mix(in srgb, var(--primary) 28%, transparent)"
            : "var(--border)",
        background:
          tone === "accent"
            ? "color-mix(in srgb, var(--primary) 9%, transparent)"
            : "rgba(0,0,0,0.16)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
        {title}
      </p>
      <p className="mt-2 text-lg font-bold text-white">{rewardSummary(reward)}</p>
      {details.length > 0 ? (
        <div className="mt-3 space-y-2">
          {details.map((item) => (
            <div key={`${title}-${item.label}`} className="flex items-start justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.18em] text-[var(--foreground)]/45">
                {item.label}
              </span>
              <span className="max-w-[55%] text-right text-xs text-[var(--foreground)]/75 break-words">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function placementLabel(rank: number | null) {
  if (rank === null) return "Unranked";
  return `#${rank}`;
}

function stateLabel(state: WarApiData["state"]) {
  switch (state) {
    case "live":
      return "Live";
    case "upcoming":
      return "Upcoming";
    case "past":
      return "Completed";
    default:
      return "Inactive";
  }
}

export default function WarInfoPage() {
  const [war, setWar] = useState<WarApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    async function loadWar() {
      setLoading(true);
      try {
        const res = await fetch("/api/war", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        setWar(json?.success ? json : null);
      } catch {
        setWar(null);
      } finally {
        setLoading(false);
      }
    }

    loadWar();
    const i = window.setInterval(loadWar, 10_000);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  const startMs = toMs(war?.startTime ?? null);
  const endMs = toMs(war?.endTime ?? null);
  const valid = startMs !== null && endMs !== null && endMs > startMs;
  const timeLeftMs = valid ? Math.max(0, endMs! - now) : null;
  const progress = valid ? Math.min(100, ((now - startMs!) / (endMs! - startMs!)) * 100) : 0;

  const state = war?.state ?? (war?.active ? "live" : "inactive");
  const rewards = war?.rewards ?? { headlineReward: null, placementRewards: [], tieredRewards: null };

  const rewardGroups = useMemo(() => {
    const tiers = war?.rewards?.tieredRewards;
    if (!tiers) return [] as Array<{ label: string; items: RewardLike[] }>;

    return Object.entries(tiers)
      .filter(([, items]) => Array.isArray(items) && items.length > 0)
      .map(([label, items]) => ({
        label: label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "),
        items,
      }));
  }, [war?.rewards?.tieredRewards]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {loading ? (
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            Loading War Info...
          </div>
        ) : !war ? (
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            No war data available right now.
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <section
              className="overflow-hidden rounded-[2rem] border backdrop-blur"
              style={{
                borderColor: "var(--border)",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 86%, transparent))",
              }}
            >
              <div className="relative min-h-[220px] overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-20"
                  style={{ backgroundImage: `url(${HERO_IMAGE_URL})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/80" />
                <div className="relative flex min-h-[220px] flex-col justify-between p-6 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{
                        borderColor: "color-mix(in srgb, var(--primary) 28%, transparent)",
                        background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                        color: "var(--foreground)",
                      }}
                    >
                      {stateLabel(state)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/70">
                      {war.warName ?? "No Active War"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">
                      War Info
                    </p>
                    <h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">
                      {war.warName ?? "No Active War"}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--foreground)]/75">
                      {formatDateTime(war.startTime)} — {formatDateTime(war.endTime)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-6">
                <Card title="Battle progress">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Current placement
                        </p>
                        <p className="mt-2 text-4xl font-black text-white">
                          {placementLabel(war.clanRank)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Time remaining
                        </p>
                        <p className="mt-2 text-2xl font-bold text-[var(--primary)]">
                          {timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"}
                        </p>
                      </div>
                    </div>

                    <ProgressBar value={progress} />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Total clans
                        </p>
                        <p className="mt-1 text-xl font-black text-white">
                          {formatNumber(war.totalClans)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Participants
                        </p>
                        <p className="mt-1 text-xl font-black text-white">
                          {formatNumber(war.participants)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Progress
                        </p>
                        <p className="mt-1 text-xl font-black text-white">
                          {progress.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Rewards">
                  <div className="space-y-4">
                    <RewardCard title="Headline reward" reward={rewards.headlineReward} tone="accent" />

                    {rewards.placementRewards.length > 0 ? (
                      <div>
                        <p className="mb-3 text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Placement rewards
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {rewards.placementRewards.map((reward, index) => (
                            <RewardCard
                              key={`placement-${index}`}
                              title={`Placement ${index + 1}`}
                              reward={reward}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {rewardGroups.length > 0 ? (
                      <div>
                        <p className="mb-3 text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                          Tiered rewards
                        </p>
                        <div className="space-y-3">
                          {rewardGroups.map((group) => (
                            <div key={group.label} className="rounded-2xl border border-[var(--border)] bg-black/12 p-4">
                              <p className="text-sm font-semibold text-white">{group.label}</p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {group.items.map((reward, index) => (
                                  <RewardCard key={`${group.label}-${index}`} title={`Item ${index + 1}`} reward={reward} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="Battle snapshot">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        War name
                      </p>
                      <p className="mt-1 text-lg font-bold text-white">{war.warName ?? "—"}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Current placement
                      </p>
                      <p className="mt-1 text-lg font-bold text-white">{placementLabel(war.clanRank)}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Starts
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatDateTime(war.startTime)}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Ends
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatDateTime(war.endTime)}</p>
                    </div>
                  </div>
                </Card>

                <Card title="Battle progress details">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Duration
                      </p>
                      <p className="mt-1 text-xl font-black text-white">
                        {formatDuration(valid ? (endMs! - startMs!) : null)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Live progress
                      </p>
                      <p className="mt-1 text-xl font-black text-white">{progress.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Battle status
                      </p>
                      <p className="mt-1 text-xl font-black text-white">{stateLabel(state)}</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
