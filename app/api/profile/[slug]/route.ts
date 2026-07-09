import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
});

type McwvUser = {
id: number;
username: string;
roblox_id: string;
discord_id: string | number | null;
role: "member" | "officer" | "owner";
theme?: string | null;
} | null;

type Ps99ViewEnvelope = {
available: boolean;
isStale?: boolean;
fetchedAt?: string;
reason?: "not_public" | "no_recent_data" | "not_implemented";
data?: unknown;
};

type Ps99PlayerResponse = {
status: "ok";
data: {
account: {
robloxUserId: string;
username: string;
displayName: string | null;
publicViews: Record<string, true>;
};
views?: Record<string, Ps99ViewEnvelope>;
profile?: unknown;
inventory?: unknown;
extendedProfile?: unknown;
[key: string]: unknown;
};
};

type EquippedPetSummary = {
uid: string | null;
slot: string | null;
id: string | null;
displayName: string;
icon: string;
goldenIcon: string;
shiny: boolean;
golden: boolean;
rainbow: boolean;
rarity: "Titanic" | "Huge" | null;
};

type EquippedEnchantSummary = {
uid: string | null;
slot: string | null;
id: string | null;
displayName: string;
icon: string;
paid: boolean;
level: number;
};

const MASTERY_MAX_LEVEL = 99;
const MASTERY_98_XP_CAP = 13_034_431;
const masteryXpCache = new Map<number, number>();

function getCookieUserId(req: Request): number | null {
const cookie = req.headers.get("cookie") || "";
const match = cookie.match(/mcwv_user=([^;]+)/);

if (!match) return null;

const userId = Number(match[1]);
return Number.isFinite(userId) ? userId : null;
}

async function getAuthUser(req: Request): Promise<McwvUser> {
const userId = getCookieUserId(req);
if (!userId) return null;

const result = await pool.query(
"SELECT id, username, roblox_id, discord_id, role, theme FROM users WHERE id = $1 LIMIT 1",
[userId]
);

return result.rows[0] ?? null;
}

async function resolveMcwvUser(slug: string): Promise<McwvUser> {
const result = await pool.query(
"SELECT id, username, roblox_id, discord_id, role, theme FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(roblox_id) = LOWER($1) LIMIT 1",
[slug]
);

return result.rows[0] ?? null;
}

function normalizeNumber(value: unknown): number | null {
if (typeof value === "number" && Number.isFinite(value)) return value;

if (typeof value === "string" && value.trim() !== "") {
const n = Number(value);
return Number.isFinite(n) ? n : null;
}

return null;
}

function getNestedValue(obj: unknown, path: string[]): unknown {
let current: unknown = obj;

for (const key of path) {
if (!current || typeof current !== "object") return undefined;
current = (current as Record<string, unknown>)[key];
}

return current;
}

function getNestedObject<T extends object = Record<string, unknown>>(
obj: unknown,
path: string[]
): T | null {
const value = getNestedValue(obj, path);
return value && typeof value === "object" ? (value as T) : null;
}

function countObjectKeys(value: unknown): number {
if (!value || typeof value !== "object") return 0;
return Object.keys(value as Record<string, unknown>).length;
}

function getRobloxAvatarUrl(robloxId: string) {
return `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent( robloxId )}&size=150x150&format=Png`;
}

function getPetIconUrl(name: string, golden = false) {
const fileName = golden ? "${name} (Golden)" : name;
return `https://raw.githubusercontent.com/BIG-Games-LLC/ps99-public-api-docs/master/Pet%20Icons/${encodeURIComponent( fileName )}.png`;
}

function masteryCumulativeXpForLevel(level: number): number {
const safeLevel = Math.max(0, Math.floor(level));

if (safeLevel <= 0) return 0;
if (masteryXpCache.has(safeLevel)) return masteryXpCache.get(safeLevel)!;

let total = 0;

for (let i = 1; i <= safeLevel; i++) {
total += Math.floor(0.25 * Math.floor(i + 300 * Math.pow(2, i / 7)));
}

if (safeLevel === 98) {
total = MASTERY_98_XP_CAP;
}

masteryXpCache.set(safeLevel, total);
return total;
}

function xpToMasteryLevel(xp: number): number {
if (!Number.isFinite(xp) || xp <= 0) return 0;
if (xp >= MASTERY_98_XP_CAP) return MASTERY_MAX_LEVEL;

let low = 0;
let high = MASTERY_MAX_LEVEL;

while (low < high) {
const mid = Math.ceil((low + high + 1) / 2);
if (masteryCumulativeXpForLevel(mid) <= xp) {
low = mid;
} else {
high = mid - 1;
}
}

return low;
}

function extractDiamonds(profileData: Record<string, any> | null): number | null {
if (!profileData) return null;

return (
normalizeNumber(profileData.Currency?.Diamonds?._am) ??
normalizeNumber(profileData.Currency?.Diamonds?.amount) ??
normalizeNumber(profileData.Currency?.Diamonds?.Amount) ??
normalizeNumber(profileData.Currency?.Diamonds?.value) ??
normalizeNumber(profileData.Currency?.Diamonds?.Value) ??
normalizeNumber(profileData.Currency?.Diamonds) ??
normalizeNumber(profileData.Diamonds) ??
normalizeNumber(profileData.Gems) ??
null
);
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
const keys = [
"Level",
"level",
"CurrentLevel",
"currentLevel",
"Rank",
"rank",
"DisplayLevel",
"displayLevel",
"Value",
"value",
"Amount",
"amount",
"Progress",
"progress",
"XP",
"xp",
"_am",
];

for (const key of keys) {
const candidate = normalizeNumber(obj[key]);
if (candidate !== null) {
const keyLower = key.toLowerCase();
const looksLikeXp =
keyLower.includes("xp") ||
keyLower.includes("progress") ||
keyLower.includes("amount") ||
keyLower.includes("value") ||
key === "_am" ||
candidate > MASTERY_MAX_LEVEL;

  return looksLikeXp ? xpToMasteryLevel(candidate) : candidate;
}

}

for (const nested of Object.values(obj)) {
const candidate = normalizeMasteryEntry(nested);
if (candidate !== null) return candidate;
}

return null;
}

function normalizeMasteryMap(
masteryRaw: Record<string, unknown> | null
): Record<string, number> | null {
if (!masteryRaw) return null;

const out: Record<string, number> = {};

for (const [name, value] of Object.entries(masteryRaw)) {
const level = normalizeMasteryEntry(value);
if (level !== null) {
out[name] = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.round(level)));
}
}

return Object.keys(out).length > 0 ? out : null;
}

function buildInventorySummary(inventoryData: Record<string, any> | null) {
if (!inventoryData) return null;

const items = Array.isArray(inventoryData.items) ? inventoryData.items : [];
const pets = getNestedObject<Record<string, any>>(inventoryData, ["equipped", "pets"]);
const enchants = getNestedObject<Record<string, any>>(inventoryData, ["equipped", "enchants"]);

const petList = Array.isArray(pets?.list) ? pets.list : [];
const enchantList = Array.isArray(enchants?.list) ? enchants.list : [];

let hugePetsEquipped = 0;
let titanicPetsEquipped = 0;
let shinyPetsEquipped = 0;
let goldenPetsEquipped = 0;
let rainbowPetsEquipped = 0;

const equippedPets: EquippedPetSummary[] = petList.map((pet, index) => {
const displayName = String(pet?.displayName ?? pet?.id ?? "Unknown");
const lower = displayName.toLowerCase();
const golden = Boolean(pet?.golden);
const shiny = Boolean(pet?.shiny);
const rainbow = Boolean(pet?.rainbow);

if (lower.includes("titanic")) titanicPetsEquipped += 1;
if (lower.startsWith("huge ")) hugePetsEquipped += 1;
if (shiny) shinyPetsEquipped += 1;
if (golden) goldenPetsEquipped += 1;
if (rainbow) rainbowPetsEquipped += 1;

return {
  uid: pet?.uid ? String(pet.uid) : null,
  slot: pet?.slot ? String(pet.slot) : String(index + 1),
  id: pet?.id ? String(pet.id) : null,
  displayName,
  icon: getPetIconUrl(displayName, golden),
  goldenIcon: getPetIconUrl(displayName, true),
  shiny,
  golden,
  rainbow,
  rarity: lower.includes("titanic") ? "Titanic" : lower.startsWith("huge ") ? "Huge" : null,
};

});

const equippedEnchants: EquippedEnchantSummary[] = enchantList.map((ench, index) => ({
uid: ench?.uid ? String(ench.uid) : null,
slot: ench?.slot ? String(ench.slot) : String(index + 1),
id: ench?.id ? String(ench.id) : null,
displayName: String(ench?.displayName ?? ench?.id ?? "Unknown"),
icon: String(ench?.icon ?? ""),
paid: Boolean(ench?.paid),
level: normalizeNumber(ench?.level) ?? 0,
}));

return {
itemsOwned: items.length,
equippedPetsCount: normalizeNumber(pets?.equippedCount) ?? petList.length,
maxPets: normalizeNumber(pets?.maxEquipped),
equippedEnchantsCount: enchantList.length,
paidEnchantSlots: normalizeNumber(enchants?.paidCount),
maxEnchants: normalizeNumber(enchants?.maxEnchants),
maxPaidEnchants: normalizeNumber(enchants?.maxPaidEnchants),
hugePetsEquipped,
titanicPetsEquipped,
shinyPetsEquipped,
goldenPetsEquipped,
rainbowPetsEquipped,
equippedPets,
equippedEnchants,
ultimate: String(
getNestedValue(inventoryData, ["equipped", "ultimate", "displayName"]) ?? "—"
),
hoverboard: String(
getNestedValue(inventoryData, ["equipped", "hoverboard", "displayName"]) ?? "—"
),
booth: String(
getNestedValue(inventoryData, ["equipped", "booth", "displayName"]) ?? "—"
),
};
}

function buildNormalizedSummary(profileData: Record<string, any> | null) {
if (!profileData) return null;

const masteryRaw = getNestedObject<Record<string, unknown>>(profileData, ["Mastery"]);
const masteryLevels = normalizeMasteryMap(masteryRaw);

const statistics = getNestedObject<Record<string, any>>(profileData, ["Statistics"]);
const achievements = getNestedObject<Record<string, any>>(profileData, ["Achievements"]);
const unlockedZones = getNestedObject<Record<string, boolean>>(profileData, ["UnlockedZones"]);
const purchasedEggs = getNestedObject<Record<string, boolean>>(profileData, ["PurchasedEggs"]);
const loginStreak = getNestedObject<Record<string, any>>(profileData, ["LoginStreak"]);

const masteryValues = masteryLevels ? Object.values(masteryLevels) : [];
const masteryAverage =
masteryValues.length > 0
? Math.round(
masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length
)
: null;

return {
rank: normalizeNumber(profileData.Rank),
rankStars: normalizeNumber(profileData.RankStars),
rebirths: normalizeNumber(profileData.Rebirths),
goalsCompleted: normalizeNumber(profileData.GoalsCompleted),
eggsHatched: normalizeNumber(profileData.EggsHatched),
maximumAvailableEgg: normalizeNumber(profileData.MaximumAvailableEgg),
totalSessions: normalizeNumber(profileData.TotalSessions),
firstJoinTimestamp: normalizeNumber(profileData.FirstJoinTimestamp),
lastJoinTimestamp: normalizeNumber(profileData.LastJoinTimestamp),
boothDiamondsEarned: normalizeNumber(profileData.BoothDiamondsEarned),
boothSlots: normalizeNumber(profileData.BoothSlots),
eggSlotsPurchased: normalizeNumber(profileData.EggSlotsPurchased),
petSlotsPurchased: normalizeNumber(profileData.PetSlotsPurchased),
gems: extractDiamonds(profileData),
mastery: masteryLevels,
masteryAverage,
statistics: statistics ?? null,
achievementsCount: achievements ? countObjectKeys(achievements) : 0,
zonesUnlockedCount: unlockedZones ? countObjectKeys(unlockedZones) : 0,
purchasedEggsCount: purchasedEggs ? countObjectKeys(purchasedEggs) : 0,
loginStreak: loginStreak ?? null,
};
}

async function fetchPs99Player(slug: string, include = "profile,inventory,extendedProfile") {
const url = new URL(`https://ps99.biggamesapi.io/v1/players/${encodeURIComponent(slug)}`);

if (include.trim()) {
url.searchParams.set("include", include);
}

const res = await fetch(url.toString(), {
headers: {
Accept: "application/json",
},
cache: "no-store",
});

const text = await res.text();
let json: unknown = null;

try {
json = text ? JSON.parse(text) : null;
} catch {
json = null;
}

return { res, json };
}

export async function GET(
req: Request,
{ params }: { params: Promise<{ slug: string }> }
) {
try {
const { slug } = await params;
const include =
new URL(req.url).searchParams.get("include") ||
"profile,inventory,extendedProfile";

let mcwvUser: McwvUser = null;
let targetSlug = slug;

if (slug === "me") {
  mcwvUser = await getAuthUser(req);

  if (!mcwvUser?.roblox_id) {
    return NextResponse.json(
      {
        status: "error",
        error: { code: "unauthorized" },
      },
      { status: 401 }
    );
  }

  targetSlug = mcwvUser.roblox_id;
} else {
  mcwvUser = await resolveMcwvUser(slug);
  if (mcwvUser?.roblox_id) {
    targetSlug = mcwvUser.roblox_id;
  }
}

const { res, json } = await fetchPs99Player(targetSlug, include);

if (!res.ok) {
  const code =
    json && typeof json === "object" && "error" in json
      ? (json as any)?.error?.code
      : null;

  if (res.status === 404 || code === "player_not_found") {
    return NextResponse.json(
      {
        status: "error",
        error: { code: "player_not_found" },
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    {
      status: "error",
      error: { code: "internal_error" },
    },
    { status: 500 }
  );
}

const data = json as Ps99PlayerResponse | null;
const account = data?.data?.account ?? null;
const views = data?.data?.views ?? {};

const profileFallback = (data?.data as Record<string, unknown> | undefined)?.profile;
const inventoryFallback = (data?.data as Record<string, unknown> | undefined)?.inventory;
const extendedProfileFallback = (data?.data as Record<string, unknown> | undefined)?.extendedProfile;

const profileView =
  views.profile ??
  (profileFallback !== undefined
    ? ({
        available: true,
        data: profileFallback,
      } as Ps99ViewEnvelope)
    : null);

const inventoryView =
  views.inventory ??
  (inventoryFallback !== undefined
    ? ({
        available: true,
        data: inventoryFallback,
      } as Ps99ViewEnvelope)
    : null);

const extendedProfileView =
  views.extendedProfile ??
  (extendedProfileFallback !== undefined
    ? ({
        available: true,
        data: extendedProfileFallback,
      } as Ps99ViewEnvelope)
    : null);

const profileData =
  profileView &&
  profileView.available &&
  profileView.data &&
  typeof profileView.data === "object"
    ? (profileView.data as Record<string, any>)
    : null;

const inventoryData =
  inventoryView &&
  inventoryView.available &&
  inventoryView.data &&
  typeof inventoryView.data === "object"
    ? (inventoryView.data as Record<string, any>)
    : null;

const extendedProfileData =
  extendedProfileView &&
  extendedProfileView.available &&
  extendedProfileView.data &&
  typeof extendedProfileView.data === "object"
    ? (extendedProfileView.data as Record<string, any>)
    : null;

const normalizedSummary = buildNormalizedSummary(profileData);
const inventorySummary = buildInventorySummary(inventoryData);

return NextResponse.json(
  {
    status: "ok",
    data: {
      account: {
        robloxUserId: account?.robloxUserId ?? targetSlug,
        username: account?.username ?? targetSlug,
        displayName: account?.displayName ?? null,
        avatarUrl: getRobloxAvatarUrl(account?.robloxUserId ?? targetSlug),
        publicViews: account?.publicViews ?? {},
      },
      mcwv: mcwvUser
        ? {
            id: mcwvUser.id,
            username: mcwvUser.username,
            roblox_id: mcwvUser.roblox_id,
            discord_id: mcwvUser.discord_id,
            role: mcwvUser.role,
            theme: mcwvUser.theme ?? null,
          }
        : null,
      summary: normalizedSummary,
      inventorySummary,
      views: {
        profile: profileView,
        inventory: inventoryView,
        extendedProfile: extendedProfileView,
      },
      raw: {
        profile: profileData,
        inventory: inventoryData,
        extendedProfile: extendedProfileData,
      },
    },
  },
  {
    headers: {
      "Cache-Control": "no-store",
    },
  }
);

} catch {
return NextResponse.json(
{
status: "error",
error: { code: "internal_error" },
},
{ status: 500 }
);
}
}
