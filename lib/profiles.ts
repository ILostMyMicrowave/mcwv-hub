// Shared parsing + fetching for the staff Profiles page.
// Reuses the same BIG Games account-view shapes as app/api/profile/[slug]/route.ts.

export type MemberProfile = {
  robloxId: string;
  username: string;
  discordId: string | null;
  role: "member" | "officer" | "owner";
  connected: boolean;
  avatarUrl: string | null;
  // stats (null when not connected / not available)
  gems: number | null;
  masteryAverage: number | null;
  rank: number | null;
  rankStars: number | null;
  rebirths: number | null;
  eggsHatched: number | null;
  totalSessions: number | null;
  zonesUnlocked: number | null;
  achievementsCount: number | null;
  goalsCompleted: number | null;
  boothDiamondsEarned: number | null;
  robuxSpent: number | null;
  firstJoin: number | null;
  lastJoin: number | null;
  mastery: Record<string, number> | null;
  // Change over the current war (most recent snapshot minus earliest in window).
  gemDelta: number | null;
  gamepasses: string[];
  equippedPets: string[];
  ultimate: string | null;
  hoverboard: string | null;
  booth: string | null;
};

export type WarTimelinePoint = {
  time: number;
  rank: number | null;
  points: number | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getNested(data: Record<string, any> | null, path: string[]): unknown {
  let cur: unknown = data;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as any)) {
      cur = (cur as any)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

const MASTERY_MAX_LEVEL = 99;
const MASTERY_98_XP_CAP = 13034431;

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractDiamonds(profileData: Record<string, any> | null): number | null {
  if (!profileData) return null;
  const diamonds = profileData.Currency?.Diamonds ?? profileData.Diamonds ?? profileData.Gems;
  if (diamonds && typeof diamonds === "object") {
    const d = diamonds as Record<string, unknown>;
    return (
      normalizeNumber(d._am) ??
      normalizeNumber(d.amount) ??
      normalizeNumber(d.Amount) ??
      normalizeNumber(d.value) ??
      normalizeNumber(d.Value) ??
      normalizeNumber(d.count) ??
      normalizeNumber(d.Count) ??
      null
    );
  }
  return normalizeNumber(diamonds);
}

function masteryCumulativeXpForLevel(level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));
  if (safeLevel <= 0) return 0;
  let total = 0;
  for (let i = 1; i < safeLevel; i++) {
    total += Math.floor(0.25 * Math.floor(i + 300 * Math.pow(2, i / 7)));
  }
  if (safeLevel >= 99) total = MASTERY_98_XP_CAP;
  return total;
}

function xpToMasteryLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  if (xp >= MASTERY_98_XP_CAP) return MASTERY_MAX_LEVEL;
  let low = 0;
  let high = MASTERY_MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (masteryCumulativeXpForLevel(mid) <= xp) low = mid;
    else high = mid - 1;
  }
  return low;
}

function normalizeMasteryEntry(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= MASTERY_MAX_LEVEL) return Math.max(0, Math.round(value));
    return xpToMasteryLevel(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      if (n <= MASTERY_MAX_LEVEL) return Math.max(0, Math.round(n));
      return xpToMasteryLevel(n);
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const amount = obj._am ?? obj.amount ?? obj.Amount ?? obj.value ?? obj.Value ?? obj.count ?? obj.Count;
  return normalizeMasteryEntry(amount);
}

function normalizeMasteryMap(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const level = normalizeMasteryEntry(v);
    if (level !== null) out[k] = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.round(level)));
  }
  return Object.keys(out).length ? out : null;
}

function countObjectKeys(obj: unknown): number {
  if (!obj || typeof obj !== "object") return 0;
  return Object.keys(obj).length;
}

export function parseProfileView(profileData: Record<string, any> | null) {
  if (!profileData) return null;
  const masteryRaw = getNested(profileData, ["Mastery"]);
  const masteryLevels = normalizeMasteryMap(masteryRaw);
  const masteryValues = masteryLevels ? Object.values(masteryLevels) : [];
  const masteryAverage =
    masteryValues.length > 0
      ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
      : null;
  const achievements = getNested(profileData, ["Achievements"]);
  const zones = getNested(profileData, ["UnlockedZones"]);
  return {
    gems: extractDiamonds(profileData),
    masteryAverage,
    rank: toNumber(getNested(profileData, ["Rank"])),
    rankStars: toNumber(getNested(profileData, ["RankStars"])),
    rebirths: toNumber(getNested(profileData, ["Rebirths"])),
    eggsHatched: toNumber(getNested(profileData, ["EggsHatched"])),
    totalSessions: toNumber(getNested(profileData, ["TotalSessions"])),
    zonesUnlocked: countObjectKeys(zones),
    achievementsCount: countObjectKeys(achievements),
    goalsCompleted: toNumber(getNested(profileData, ["GoalsCompleted"])),
    boothDiamondsEarned: toNumber(getNested(profileData, ["BoothDiamondsEarned"])),
    firstJoin: toNumber(getNested(profileData, ["FirstJoinTimestamp"])),
    lastJoin: toNumber(getNested(profileData, ["LastJoinTimestamp"])),
    mastery: masteryLevels,
  };
}

export function parseInventoryView(inventoryData: Record<string, any> | null) {
  if (!inventoryData) return { equippedPets: [], ultimate: null, hoverboard: null, booth: null };
  const equipped = (getNested(inventoryData, ["equipped"]) || {}) as any;
  const pets = (equipped?.pets || []) as any[];
  const equippedPets = Array.isArray(pets)
    ? pets.map((p) => String(p?.displayName ?? p?.id ?? "?").trim()).filter(Boolean).slice(0, 8)
    : [];
  return {
    equippedPets,
    ultimate: String(equipped?.ultimate?.displayName ?? "") || null,
    hoverboard: String(equipped?.hoverboard?.displayName ?? "") || null,
    booth: String(equipped?.booth?.displayName ?? "") || null,
  };
}

export function parseGamepasses(extendedData: Record<string, any> | null): string[] {
  if (!extendedData) return [];
  // extendedProfile carries gamepass ownership; tolerate multiple shapes.
  const raw = getNested(extendedData, ["gamepasses"]) || getNested(extendedData, ["Gamepasses"]);
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const g of raw) {
      if (typeof g === "string") out.push(g);
      else if (g && typeof g === "object") {
        const name = String(g?.displayName ?? g?.name ?? "").trim();
        if (name) out.push(name);
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (v === true || v === 1) out.push(k);
    }
  }
  return [...new Set(out)];
}

export function robloxAvatarUrl(robloxId: string): string {
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=420&height=420&format=png`;
}

// Fetch a single /v1/account/<view> with a bearer token.
export async function fetchAccountView(
  view: string,
  accessToken: string
): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`https://ps99.biggamesapi.io/v1/account/${view}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!json || json.status === "error") return null;
    return json?.data ?? json ?? null;
  } catch {
    return null;
  }
}
