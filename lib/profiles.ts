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
  rankStars: number | null;
  // Change over the current war (most recent snapshot minus earliest in window).
  gemDelta: number | null;
  gamepasses: string[];
  equippedPets: string[];
  ultimate: string | null;
  hoverboard: string | null;
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

function extractDiamonds(profileData: Record<string, any> | null): number | null {
  if (!profileData) return null;
  const root = getNested(profileData, ["data"]);
  const source: any = root && typeof root === "object" ? root : profileData;
  const currency = (getNested(source, ["Currency"]) || {}) as any;
  const diamonds = currency?.Diamonds ?? source?.Diamonds ?? source?.Gems;
  const n = Number(diamonds);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function normalizeMasteryMap(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
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
  return {
    gems: extractDiamonds(profileData),
    masteryAverage,
    rankStars: toNumber(getNested(profileData, ["RankStars"])),
  };
}

export function parseInventoryView(inventoryData: Record<string, any> | null) {
  if (!inventoryData) return { equippedPets: [], ultimate: null, hoverboard: null };
  const equipped = (getNested(inventoryData, ["equipped"]) || {}) as any;
  const pets = (equipped?.pets || []) as any[];
  const equippedPets = Array.isArray(pets)
    ? pets.map((p) => String(p?.displayName ?? p?.id ?? "?").trim()).filter(Boolean).slice(0, 8)
    : [];
  return {
    equippedPets,
    ultimate: String(equipped?.ultimate?.displayName ?? "") || null,
    hoverboard: String(equipped?.hoverboard?.displayName ?? "") || null,
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
