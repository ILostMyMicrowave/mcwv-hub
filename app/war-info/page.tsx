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

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function toMs(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
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

function rewardText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return `${value.length} items`;
  return null;
}

function rewardTitle(reward: RewardLike | null) {
  if (!reward) return "—";

  const preferredKeys = ["name", "title", "displayName", "item", "pet", "reward", "label", "id"];
  for (const key of preferredKeys) {
    const value = rewardText(reward[key]);
    if (value) return value;
  }

  return "Reward";
}

function rewardMeta(reward: RewardLike | null) {
  if (!reward) return [] as string[];

  const parts: string[] = [];
  const variant = rewardText(reward.variant) ?? rewardText(reward.type);
  const amount = rewardText(reward.amount) ?? rewardText(reward.count);
  const tier = rewardText(reward.particleTier) ?? rewardText(reward.tier);

  if (variant) parts.push(variant);
  if (amount) parts.push(amount);
  if (tier) parts.push(`Tier ${tier}`);

  return parts;
}

function resolveRobloxImageUrl(src: string | null | undefined): string {
  if (!src) return "";
  const value = src.trim();
  if (!value) return "";

  if (value.startsWith("rbxassetid://")) {
    const id = value.replace("rbxassetid://", "").trim();
    return id ? `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}` : "";
  }

  if (value.startsWith("rbxthumb://")) {
    const match = value.match(/id=(\d+)/);
    if (match?.[1]) return `https://assetdelivery.roblox.com/v1/asset/?id=${match[1]}`;
  }

  return value;
}

function getPetIconUrl(name: string, golden = false) {
  const fileName = golden ? `${name} (Golden)` : name;
  return `https://raw.githubusercontent.com/BIG-Games-LLC/ps99-public-api-docs/master/Pet%20Icons/${encodeURIComponent(
    fileName
  )}.png`;
}

function rewardIconSource(reward: RewardLike | null) {
  if (!reward) return "";

  const direct = [reward.icon, reward.image, reward.img, reward.thumbnail, reward.asset, reward.url, reward.iconUrl];
  for (const candidate of direct) {
    if (typeof candidate === "string" && candidate.trim()) return resolveRobloxImageUrl(candidate);
  }

  const title = rewardTitle(reward);
  const rawType = String(reward.variant ?? reward.type ?? reward.name ?? reward.title ?? "");
  const golden = /golden/i.test(rawType);
  return getPetIconUrl(title, golden);
}

function formatGroupLabel(label: string) {
  return label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

function placementLabel(rank: number | null) {
  if (rank === null) return "Unavailable";
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
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[2rem] border p-5 sm:p-6 backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--card) 92%, transparent)",
      }}
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">
          {title}
        </p>
        {subtitle ? <p className="mt-1 text-sm text-[var(--foreground)]/65">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-black/14 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function RewardCard({ reward }: { reward: RewardLike | null }) {
  const icon = rewardIconSource(reward);
  const title = rewardTitle(reward);
  const meta = rewardMeta(reward);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-black/14 p-3 transition duration-200 hover:-translate-y-0.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon}
            alt={title}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="text-lg">🎁</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{title}</p>
        {meta.length > 0 ? (
          <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-[var(--foreground)]/55">
            {meta.join(" • ")}
          </p>
        ) : null}
      </div>
    </div>
  );
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
  const timeLeftMs = valid ? Math.max(0, endMs - now) : null;
  const progress = valid ? Math.min(100, ((now - startMs) / (endMs - startMs)) * 100) : 0;

  const state = war?.state ?? (war?.active ? "live" : "inactive");
  const finalPlacement = placementLabel(war?.clanRank ?? null);
  const rewards = war?.rewards ?? { headlineReward: null, placementRewards: [], tieredRewards: null };
  const durationText = valid ? formatDuration(endMs - startMs) : "—";

  const rewardGroups = useMemo(() => {
    const tiers = war?.rewards?.tieredRewards;
    if (!tiers) return [] as Array<{ label: string; items: RewardLike[] }>;

    return Object.entries(tiers)
      .filter(([, items]) => Array.isArray(items) && items.length > 0)
      .map(([label, items]) => ({
        label: formatGroupLabel(label),
        items,
      }));
  }, [war?.rewards?.tieredRewards]);

  const statusText = valid ? stateLabel(state) : "Completed";

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
              className="rounded-[2rem] border p-6 sm:p-7 backdrop-blur"
              style={{
                borderColor: "var(--border)",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), color-mix(in srgb, var(--card) 86%, transparent))",
              }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{
                        borderColor: "color-mix(in srgb, var(--primary) 28%, transparent)",
                        background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                        color: "var(--foreground)",
                      }}
                    >
                      {statusText}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/70">
                      {war.warName ?? "No Active War"}
                    </span>
                  </div>

                  <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">
                    {war.warName ?? "No Active War"}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--foreground)]/70">
                    {formatDateTime(war.startTime)} — {formatDateTime(war.endTime)}
                  </p>
                </div>

                <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 lg:w-[420px]">
                  <DetailPill label="Placement" value={finalPlacement} />
                  <DetailPill label="Countdown" value={timeLeftMs !== null ? formatDuration(timeLeftMs) : "—"} />
                </div>
              </div>
            </section>

            <Card title="Battle progress" subtitle="The main countdown and status for the war.">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <DetailPill label="Current placement" value={finalPlacement} />
                  <DetailPill label="Starts" value={formatDateTime(war.startTime)} />
                  <DetailPill label="Ends" value={formatDateTime(war.endTime)} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailPill label="Duration" value={durationText} />
                  <DetailPill label="Status" value={statusText} />
                </div>

                <ProgressBar value={progress} />
              </div>
            </Card>

            <Card title="Rewards" subtitle="Small, visual cards with item icons where available.">
              <div className="space-y-4">
                <RewardCard reward={rewards.headlineReward} />

                {rewards.placementRewards.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                      Placement rewards
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {rewards.placementRewards.map((reward, index) => (
                        <RewardCard key={`placement-${index}`} reward={reward} />
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
                              <RewardCard key={`${group.label}-${index}`} reward={reward} />
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
        )}
      </div>
    </main>
  );
}
