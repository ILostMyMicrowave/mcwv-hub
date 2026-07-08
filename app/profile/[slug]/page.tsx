"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ApiResponse =
  | {
      status: "ok";
      data: {
        account: {
          robloxUserId: string;
          username: string;
          displayName: string | null;
          publicViews: Record<string, true>;
        };
        summary: {
          rank: number | null;
          rankStars: number | null;
          rebirths: number | null;
          goalsCompleted: number | null;
          eggsHatched: number | null;
          maximumAvailableEgg: number | null;
          totalSessions: number | null;
          firstJoinTimestamp: number | null;
          lastJoinTimestamp: number | null;
          boothDiamondsEarned: number | null;
          boothSlots: number | null;
          eggSlotsPurchased: number | null;
          petSlotsPurchased: number | null;
          gems: number | null;
          mastery: Record<string, number> | null;
          masteryAverage: number | null;
          statistics: Record<string, unknown> | null;
          achievementsCount: number;
          zonesUnlockedCount: number;
          purchasedEggsCount: number;
          loginStreak: Record<string, unknown> | null;
        } | null;
        views: {
          profile: {
            available: boolean;
            isStale?: boolean;
            fetchedAt?: string;
            reason?: string;
            data?: Record<string, unknown>;
          } | null;
          inventory: {
            available: boolean;
            isStale?: boolean;
            fetchedAt?: string;
            reason?: string;
            data?: {
              items?: Array<Record<string, unknown>>;
              equipped?: {
                pets?: {
                  list?: Array<Record<string, unknown>>;
                  equippedCount?: number;
                  maxEquipped?: number;
                };
                enchants?: {
                  list?: Array<Record<string, unknown>>;
                  paidCount?: number;
                  maxEnchants?: number;
                  maxPaidEnchants?: number;
                };
                ultimate?: Record<string, unknown> | null;
                hoverboard?: Record<string, unknown> | null;
                booth?: Record<string, unknown> | null;
              };
              fetchedAt?: string;
              cached?: boolean;
            };
          } | null;
          extendedProfile: {
            available: boolean;
            isStale?: boolean;
            fetchedAt?: string;
            reason?: string;
            data?: Record<string, unknown>;
          } | null;
        };
        raw: {
          profile: Record<string, unknown> | null;
          inventory: Record<string, unknown> | null;
          extendedProfile: Record<string, unknown> | null;
        };
      };
    }
  | {
      status: "error";
      error: {
        code: string;
        message?: string;
      };
    };

type SectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  right?: React.ReactNode;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatDate(value: number | null | undefined) {
  if (!value) return "—";
  const ms = value < 10_000_000_000 ? value * 1000 : value * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDays(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  const days = value / 86400;
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)}d`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function Section({ title, defaultOpen = false, children, right }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-3xl px-5 py-4 text-left transition hover:bg-white/5"
      >
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-zinc-500">
            {open ? "Click to collapse" : "Click to expand"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {right}
          <span className="text-zinc-400">{open ? "−" : "+"}</span>
        </div>
      </button>

      {open && <div className="border-t border-white/10 p-5">{children}</div>}
    </section>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  max = 99,
}: {
  label: string;
  value: number | null;
  max?: number;
}) {
  const safe = value === null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(max, value));
  const pct = Math.min(100, Math.max(0, (safe / max) * 100));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-sm text-zinc-400">{safe}/{max}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-yellow-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams<{ slug?: string | string[] }>();
  const router = useRouter();

  const slug = useMemo(() => {
    const raw = params?.slug;
    if (Array.isArray(raw)) return raw[0] || "me";
    return raw || "me";
  }, [params]);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });

        const json: ApiResponse = await res.json().catch(() => ({
          status: "error",
          error: { code: "internal_error" },
        }));

        setData(json);

        if (json.status === "error" && json.error.code === "unauthorized" && slug === "me") {
          router.push("/login");
        }
      } catch {
        setData({
          status: "error",
          error: { code: "internal_error" },
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [slug, router]);

  const ok = data?.status === "ok" ? data.data : null;
  const account = ok.account;
  const summary = ok?.summary ?? null;
  const profileView = ok?.views.profile ?? null;
  const inventoryView = ok?.views.inventory ?? null;
  const extendedView = ok?.views.extendedProfile ?? null;

  const equippedPets = inventoryView?.available
    ? inventoryView.data?.equipped?.pets?.list ?? []
    : [];
  const equippedEnchants = inventoryView?.available
    ? inventoryView.data?.equipped?.enchants?.list ?? []
    : [];

  const profilePublic = !!account?.publicViews?.profile;
  const inventoryPublic = !!account?.publicViews?.inventory;
  const extendedPublic = !!account?.publicViews?.extendedProfile;

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-black px-4 py-8 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-300">
              Loading profile...
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!ok) {
    const code = data && data.status === "error" ? data.error.code : "internal_error";

    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-black px-4 py-8 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <h1 className="text-3xl font-bold">Profile</h1>
              <p className="mt-3 text-zinc-400">
                {code === "player_not_found"
                  ? "This player has not made their PS99 profile public, or no linked account could be found."
                  : code === "unauthorized"
                    ? "Please log in to view your profile."
                    : "Something went wrong loading this profile."}
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const currentRank = summary?.rank ?? null;
  const masteryAverage = summary?.masteryAverage ?? null;

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 backdrop-blur">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="flex items-start gap-5">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-yellow-400/20 bg-yellow-400/10">
                  <span className="text-2xl font-black text-yellow-200">
                    {getInitials(account.username)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-black text-white">
                      {account.username}
                    </h1>
                    <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-200">
                      PS99 Profile
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-zinc-300">
                    {account.displayName || "No display name set"}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                      Roblox ID: {account.robloxUserId}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                      Profile: {profilePublic ? "Public" : "Private"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                      Inventory: {inventoryPublic ? "Public" : "Private"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                      Extended: {extendedPublic ? "Public" : "Private"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatPill label="Rank" value={formatNumber(currentRank)} />
                <StatPill label="Gems" value={formatNumber(summary?.gems)} />
                <StatPill label="Rebirths" value={formatNumber(summary?.rebirths)} />
                <StatPill label="Mastery Avg" value={masteryAverage === null ? "—" : `${masteryAverage}%`} />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatPill label="Eggs Hatched" value={formatNumber(summary?.eggsHatched)} />
              <StatPill label="Sessions" value={formatNumber(summary?.totalSessions)} />
              <StatPill label="Zones Unlocked" value={formatNumber(summary?.zonesUnlockedCount)} />
              <StatPill label="Achievements" value={formatNumber(summary?.achievementsCount)} />
            </div>
          </div>

          <Section title="Progression" defaultOpen right={<span className="text-xs text-zinc-400">Core stats</span>}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatPill label="Rank Stars" value={formatNumber(summary?.rankStars)} />
              <StatPill label="Goals Completed" value={formatNumber(summary?.goalsCompleted)} />
              <StatPill label="Egg Slots" value={formatNumber(summary?.eggSlotsPurchased)} />
              <StatPill label="Pet Slots" value={formatNumber(summary?.petSlotsPurchased)} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StatPill label="First Join" value={formatDate(summary?.firstJoinTimestamp)} />
              <StatPill label="Last Join" value={formatDate(summary?.lastJoinTimestamp)} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StatPill label="Booth Diamonds Earned" value={formatNumber(summary?.boothDiamondsEarned)} />
              <StatPill label="Booth Slots" value={formatNumber(summary?.boothSlots)} />
            </div>
          </Section>

          <Section title="Masteries" defaultOpen={false} right={<span className="text-xs text-zinc-400">Public profile</span>}>
            {!profileView?.available || !summary?.mastery ? (
              <p className="text-sm text-zinc-400">
                Mastery data is not public or not available.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(summary.mastery)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([name, level]) => (
                    <ProgressBar key={name} label={name} value={Number(level)} />
                  ))}
              </div>
            )}
          </Section>

          <Section title="Equipped Loadout" defaultOpen={false} right={<span className="text-xs text-zinc-400">Live gear</span>}>
            {!inventoryView?.available ? (
              <p className="text-sm text-zinc-400">
                Equipped loadout is not public or no recent data is available.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-3 text-sm font-semibold text-white">Pets</p>
                  {equippedPets.length === 0 ? (
                    <p className="text-sm text-zinc-400">No equipped pets found.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {equippedPets.map((pet, index) => (
                        <div
                          key={`${pet.uid ?? index}-${pet.id ?? index}`}
                          className="rounded-2xl border border-white/10 bg-black/25 p-4"
                        >
                          <p className="font-semibold text-white">
                            {String(pet.displayName ?? pet.id ?? "Unknown")}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Slot {String(pet.slot ?? "—")} ·{" "}
                            {pet.shiny ? "Shiny " : ""}
                            {pet.golden ? "Golden " : ""}
                            {pet.rainbow ? "Rainbow " : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-white">Enchants</p>
                  {equippedEnchants.length === 0 ? (
                    <p className="text-sm text-zinc-400">No enchants found.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {equippedEnchants.map((ench, index) => (
                        <div
                          key={`${ench.uid ?? index}-${ench.id ?? index}`}
                          className="rounded-2xl border border-white/10 bg-black/25 p-4"
                        >
                          <p className="font-semibold text-white">
                            {String(ench.displayName ?? ench.id ?? "Unknown")}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Slot {String(ench.slot ?? "—")} · Level {String(ench.level ?? "—")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StatPill
                    label="Ultimate"
                    value={String(inventoryView.data?.equipped?.ultimate?.displayName ?? "—")}
                  />
                  <StatPill
                    label="Hoverboard"
                    value={String(inventoryView.data?.equipped?.hoverboard?.displayName ?? "—")}
                  />
                  <StatPill
                    label="Booth"
                    value={String(inventoryView.data?.equipped?.booth?.displayName ?? "—")}
                  />
                </div>
              </div>
            )}
          </Section>

          <Section title="Inventory" defaultOpen={false} right={<span className="text-xs text-zinc-400">May be large</span>}>
            {!inventoryView?.available ? (
              <p className="text-sm text-zinc-400">
                Inventory is not public or no recent data is available.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatPill
                    label="Items Owned"
                    value={formatNumber(inventoryView.data?.items?.length ?? 0)}
                  />
                  <StatPill
                    label="Equipped Pets"
                    value={formatNumber(inventoryView.data?.equipped?.pets?.equippedCount)}
                  />
                  <StatPill
                    label="Max Pets"
                    value={formatNumber(inventoryView.data?.equipped?.pets?.maxEquipped)}
                  />
                  <StatPill
                    label="Paid Enchants"
                    value={formatNumber(inventoryView.data?.equipped?.enchants?.paidCount)}
                  />
                </div>

                <p className="text-xs text-zinc-500">
                  Inventory loading is intentionally light here so the page stays fast.
                </p>
              </div>
            )}
          </Section>

          <Section title="Extended Profile" defaultOpen={false} right={<span className="text-xs text-zinc-400">Sensitive public data</span>}>
            {!extendedView?.available || !ok.raw.extendedProfile ? (
              <p className="text-sm text-zinc-400">
                Extended profile is private or unavailable.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StatPill
                  label="Robux Spent"
                  value={formatNumber(
                    typeof ok.raw.extendedProfile.RobuxSpent === "number"
                      ? ok.raw.extendedProfile.RobuxSpent
                      : null
                  )}
                />
                <StatPill
                  label="Gamepasses"
                  value={formatNumber(
                    ok.raw.extendedProfile.Gamepasses &&
                      typeof ok.raw.extendedProfile.Gamepasses === "object"
                      ? Object.keys(ok.raw.extendedProfile.Gamepasses).length
                      : 0
                  )}
                />
                <StatPill
                  label="Products"
                  value={formatNumber(
                    ok.raw.extendedProfile.Products &&
                      typeof ok.raw.extendedProfile.Products === "object"
                      ? Object.keys(ok.raw.extendedProfile.Products).length
                      : 0
                  )}
                />
              </div>
            )}
          </Section>

          <Section title="MCWV" defaultOpen={true} right={<span className="text-xs text-zinc-400">Clan data</span>}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatPill label="Role" value="Member" />
              <StatPill label="Discord ID" value="Linked" />
              <StatPill label="Website Theme" value="Saved" />
              <StatPill label="Profile Route" value={slug} />
            </div>
          </Section>
        </div>
      </main>
    </>
  );
    }
