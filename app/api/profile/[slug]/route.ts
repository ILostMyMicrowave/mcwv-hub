import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { pool } from "@/lib/db";
import { getAccessToken } from "@/lib/biggames";

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
  reason?: "not_public" | "no_recent_data" | "not_implemented" | "auth_required";
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

async function getCookieUserId(): Promise<number | null> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
  if (!session.user?.id) return null
  const userId = Number(session.user.id)
  return Number.isFinite(userId) ? userId : null
}

async function getAuthUser(): Promise<McwvUser> {
  const userId = await getCookieUserId()
  if (!userId) return null

  const result = await pool.query(
    "SELECT id, username, roblox_id, discord_id, role, theme FROM users WHERE id = $1 LIMIT 1",
    [userId]
  )

  return result.rows[0] ?? null
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

function resolveRobloxImageUrl(src: unknown): string {
  if (typeof src !== "string") return "";
  const value = src.trim();
  if (!value) return "";

  if (value.startsWith("rbxassetid://")) {
    const id = value.replace("rbxassetid://", "").trim();
    return id ? `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}` : "";
  }

  if (value.startsWith("rbxthumb://")) {
    const match = value.match(/id=(\d+)/);
    if (match?.[1]) {
      return `https://assetdelivery.roblox.com/v1/asset/?id=${match[1]}`;
    }
  }

  return value;
}

async function getRobloxAvatarUrl(robloxId: string): Promise<string> {
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(
      robloxId
    )}&size=150x150&format=Png&isCircular=false`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return "";

    const json = await res.json().catch(() => null);
    return json?.data?.[0]?.imageUrl ?? "";
  } catch {
    return "";
  }
}

function getPetIconUrl(name: string, golden = false) {
  const fileName = golden ? `${name} (Golden)` : name;
  return `https://raw.githubusercontent.com/BIG-Games-LLC/ps99-public-api-docs/master/Pet%20Icons/${encodeURIComponent(
    fileName
  )}.png`;
}

function choosePetIcon(pet: Record<string, any>, fallbackName: string, golden: boolean) {
  const directIcon = resolveRobloxImageUrl(pet.icon);
  const directGoldenIcon = resolveRobloxImageUrl(pet.goldenIcon);

  if (golden && directGoldenIcon) return directGoldenIcon;
  if (directIcon) return directIcon;

  return getPetIconUrl(fallbackName, golden);
}

function masteryCumulativeXpForLevel(level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));

  if (safeLevel <= 0) return 0;
  if (masteryXpCache.has(safeLevel)) return masteryXpCache.get(safeLevel)!;

  let total = 0;

  // Sum XP for levels 1..L-1 — this is the cumulative XP required to BE level L
  // (matching the OSRS XP table the PS99 mastery curve mirrors). Summing to L
  // inclusive gave XP for level L+1, which made xpToMasteryLevel report every
  // level one too low (e.g. a true level 98 displayed as 97, and 98 was
  // unreachable because the cap early-returned 99).
  for (let i = 1; i < safeLevel; i++) {
    total += Math.floor(0.25 * Math.floor(i + 300 * Math.pow(2, i / 7)));
  }

  // Level 99 (max) = sum 1..98 = 13,034,431. The raw formula drifts by a few
  // dozen XP from the canonical OSRS value, so force the exact cap.
  if (safeLevel >= 99) {
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
    const id = pet?.id ? String(pet.id) : null;

    if (lower.includes("titanic")) titanicPetsEquipped += 1;
    if (lower.startsWith("huge ")) hugePetsEquipped += 1;
    if (shiny) shinyPetsEquipped += 1;
    if (golden) goldenPetsEquipped += 1;
    if (rainbow) rainbowPetsEquipped += 1;

    return {
      uid: pet?.uid ? String(pet.uid) : null,
      slot: pet?.slot ? String(pet.slot) : String(index + 1),
      id,
      displayName,
      icon: choosePetIcon(pet ?? {}, id ?? displayName, golden),
      goldenIcon: choosePetIcon(pet ?? {}, id ?? displayName, true),
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

function mergeViewEnvelope(
  envelope: Ps99ViewEnvelope | undefined,
  fallbackData: unknown
): Ps99ViewEnvelope | null {
  if (envelope && typeof envelope === "object") {
    if (envelope.available) return envelope;

    if (fallbackData !== undefined) {
      return {
        ...envelope,
        available: true,
        data: fallbackData,
      };
    }

    return envelope;
  }

  if (fallbackData !== undefined) {
    return {
      available: true,
      data: fallbackData,
    };
  }

  return null;
}

async function fetchPs99Player(
  slug: string,
  include = "profile,inventory,extendedProfile"
) {
  const url = new URL(
    `https://ps99.biggamesapi.io/v1/players/${encodeURIComponent(slug)}`
  );

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

// Fetch a single /v1/account/<view> with a bearer token.
async function fetchAccountView(view: string, accessToken: string) {
  const res = await fetch(`https://ps99.biggamesapi.io/v1/account/${view}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json };
}

// Build an envelope for an authenticated view. Returns null on 401/403 so the
// caller can fall back to public data.
function accountEnvelope(json: any): Ps99ViewEnvelope | null {
  if (!json) return null;
  if (json.status === "error") {
    // 401/403 from the resource server — token missing/invalid/revoked.
    const code = json?.error?.message ?? "";
    return {
      available: false,
      reason: code.toLowerCase().includes("bearer") || code.toLowerCase().includes("forbidden")
        ? "auth_required"
        : "no_recent_data",
    };
  }
  if (json.data === null || json.data === undefined) {
    return { available: false, reason: "no_recent_data" };
  }
  return { available: true, data: json.data };
}

// Fetch a member's stored BIG Games token so officers/owners can view their
// verified (non-public) data. Members store tokens keyed by roblox_id in
// big_games_tokens; applicants (no hub account) store them keyed by roblox_id
// or discord_id in big_games_discord_tokens.
async function getTargetAccessToken(
  robloxId: string | null,
  discordId: string | number | null,
  userId: number | null = null
): Promise<string | null> {
  if (!robloxId && !discordId && !userId) return null;
  try {
    // 1) Member tokens: big_games_tokens keyed by hub user_id OR roblox_id.
    if (robloxId) {
      const r = await pool.query(
        `SELECT access_token FROM big_games_tokens WHERE roblox_id = $1 LIMIT 1`,
        [robloxId]
      );
      if (r.rows[0]?.access_token) return String(r.rows[0].access_token);
    }
    if (userId) {
      const r = await pool.query(
        `SELECT access_token FROM big_games_tokens WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      if (r.rows[0]?.access_token) return String(r.rows[0].access_token);
    }
    // 2) Applicant tokens: big_games_discord_tokens by roblox_id or discord_id.
    if (robloxId) {
      const r2 = await pool.query(
        `SELECT access_token FROM big_games_discord_tokens WHERE roblox_id = $1 LIMIT 1`,
        [robloxId]
      );
      if (r2.rows[0]?.access_token) return String(r2.rows[0].access_token);
    }
    if (discordId) {
      const r3 = await pool.query(
        `SELECT access_token FROM big_games_discord_tokens WHERE discord_id = $1 LIMIT 1`,
        [String(discordId)]
      );
      if (r3.rows[0]?.access_token) return String(r3.rows[0].access_token);
    }
  } catch {
    return null;
  }
  return null;
}

// Resolve a profile slug to a numeric Roblox ID. Numeric slugs pass through;
// usernames are resolved via the BIG Games public player endpoint so we can
// look up an applicant's token even when they aren't a linked hub user.
async function resolveRobloxIdFromSlug(slug: string): Promise<string | null> {
  if (/^\d{1,20}$/.test(slug)) return slug;
  try {
    const res = await fetch(
      `https://ps99.biggamesapi.io/v1/players/${encodeURIComponent(slug)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.data?.robloxUserId
      ? String(json.data.robloxUserId)
      : null;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const { slug } = await params;
    const include =
      new URL(req.url).searchParams.get("include") ||
      "profile,inventory,extendedProfile";

    let mcwvUser: McwvUser = null;
    let targetSlug = slug;

    if (slug === "me") {
      mcwvUser = await getAuthUser();

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

    // The viewer "owns" this profile when it's /me or their linked Roblox id
    // matches the target. Only the owner's token can read their account data.
    const viewerIsOwner = Boolean(
      auth.user &&
        (slug === "me" ||
          (auth.user.robloxId && String(auth.user.robloxId) === String(targetSlug)))
    );

    // Officers & owners may view any member's private (BIG Games) data, using
    // the TARGET's stored token rather than the viewer's. Members (non-staff)
    // can only read their own profile's private data.
    const viewerIsOfficer = Boolean(
      auth.user && (auth.user.role === "officer" || auth.user.role === "owner")
    );

    let accessToken: string | null = null;
    if (viewerIsOwner && auth.user) {
      accessToken = await getAccessToken(auth.user.id).catch(() => null);
    } else if (viewerIsOfficer) {
      const targetRid = await resolveRobloxIdFromSlug(targetSlug);
      accessToken = await getTargetAccessToken(
        targetRid,
        mcwvUser?.discord_id ?? null,
        mcwvUser ? Number(mcwvUser.id) : null
      );
    }

    let res: Response | null = null;
    let json: any = null;

    if (accessToken) {
      const viewsRaw: Record<string, Ps99ViewEnvelope | null> = {};
      const viewMap: Record<string, string> = {
        profile: "profile",
        inventory: "inventory",
        extendedProfile: "extendedProfile",
      };
      for (const key of Object.keys(viewMap)) {
        try {
          const accountRes = await fetchAccountView(viewMap[key], accessToken);
          viewsRaw[key] = accountEnvelope(accountRes.json);
        } catch {
          viewsRaw[key] = null;
        }
      }
      // Model the response like the public player shape so the rest of the
      // handler is unchanged. `account` is resolved from the hub link; the
      // account envelope pulls the full (non-public) data.
      json = {
        data: {
          account: {
            robloxUserId: targetSlug,
            username: targetSlug,
            displayName: null,
            publicViews: {},
          },
          views: viewsRaw,
        },
      };
    } else {
      const player = await fetchPs99Player(targetSlug, include);
      res = player.res;
      json = player.json;
    }

    if (res && !res.ok) {
      const code =
        json && typeof json === "object" && "error" in json
          ? (json as any)?.error?.code
          : null;

      if (res.status === 404 || code === "player_not_found") {
        return NextResponse.json(
          {
            status: "error",
            error: { code: "player_not_found" },
            viewerIsOwner,
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

    const profileView = mergeViewEnvelope(views.profile, profileFallback);
    const inventoryView = mergeViewEnvelope(views.inventory, inventoryFallback);
    const extendedProfileView = mergeViewEnvelope(views.extendedProfile, extendedProfileFallback);

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
          viewerIsOwner,
          account: {
            robloxUserId: account?.robloxUserId ?? targetSlug,
            username: account?.username ?? targetSlug,
            displayName: account?.displayName ?? null,
            avatarUrl: await getRobloxAvatarUrl(account?.robloxUserId ?? targetSlug),
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

