import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type AuthUser = {
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
  };
};

function getCookieUserId(req: Request): number | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/mcwv_user=([^;]+)/);

  if (!match) return null;

  const userId = Number(match[1]);
  return Number.isFinite(userId) ? userId : null;
}

async function getAuthUser(req: Request): Promise<AuthUser> {
  const userId = getCookieUserId(req);
  if (!userId) return null;

  const result = await pool.query(
    `SELECT id, username, roblox_id, discord_id, role, theme
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function resolveRobloxId(slug: string): Promise<string | null> {
  const result = await pool.query(
    `
    SELECT roblox_id
    FROM users
    WHERE username = $1
       OR roblox_id = $1
    LIMIT 1
    `,
    [slug]
  );

  const row = result.rows[0];
  if (!row?.roblox_id) return null;

  return String(row.roblox_id);
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getNestedNumber(obj: unknown, path: string[]): number | null {
  let current: any = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = current[key];
  }
  return normalizeNumber(current);
}

function getNestedObject<T extends object = Record<string, unknown>>(
  obj: unknown,
  path: string[]
): T | null {
  let current: any = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = current[key];
  }
  return current && typeof current === "object" ? (current as T) : null;
}

function countObjectKeys(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

function buildNormalizedSummary(profileData: Record<string, any> | null) {
  if (!profileData) return null;

  const currencyDiamonds =
    getNestedNumber(profileData, ["Currency", "Diamonds", "_am"]) ??
    getNestedNumber(profileData, ["Currency", "Diamonds", "amount"]);

  const mastery = getNestedObject<Record<string, number>>(profileData, ["Mastery"]);
  const statistics = getNestedObject<Record<string, any>>(profileData, ["Statistics"]);
  const achievements = getNestedObject<Record<string, any>>(profileData, ["Achievements"]);
  const unlockedZones = getNestedObject<Record<string, boolean>>(profileData, ["UnlockedZones"]);
  const purchasedEggs = getNestedObject<Record<string, boolean>>(profileData, ["PurchasedEggs"]);
  const loginStreak = getNestedObject<Record<string, any>>(profileData, ["LoginStreak"]);

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
    gems: currencyDiamonds,
    mastery: mastery ?? null,
    masteryAverage:
      mastery && Object.keys(mastery).length > 0
        ? Math.round(
            Object.values(mastery).reduce((sum, value) => sum + Number(value || 0), 0) /
              Object.keys(mastery).length
          )
        : null,
    statistics: statistics ?? null,
    achievementsCount: achievements ? countObjectKeys(achievements) : 0,
    zonesUnlockedCount: unlockedZones ? countObjectKeys(unlockedZones) : 0,
    purchasedEggsCount: purchasedEggs ? countObjectKeys(purchasedEggs) : 0,
    loginStreak: loginStreak ?? null,
  };
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const include =
      new URL(req.url).searchParams.get("include") || "profile,inventory,extendedProfile";

    let targetSlug = slug;

    if (slug === "me") {
      const authUser = await getAuthUser(req);

      if (!authUser?.roblox_id) {
        return NextResponse.json(
          {
            status: "error",
            error: { code: "unauthorized" },
          },
          { status: 401 }
        );
      }

      targetSlug = authUser.roblox_id;
    } else {
      const resolvedRobloxId = await resolveRobloxId(slug);
      if (resolvedRobloxId) {
        targetSlug = resolvedRobloxId;
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

    const profileView = views.profile;
    const inventoryView = views.inventory;
    const extendedProfileView = views.extendedProfile;

    const profileData =
      profileView && profileView.available && profileView.data && typeof profileView.data === "object"
        ? (profileView.data as Record<string, any>)
        : null;

    const inventoryData =
      inventoryView && inventoryView.available && inventoryView.data && typeof inventoryView.data === "object"
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

    return NextResponse.json(
      {
        status: "ok",
        data: {
          account: {
            robloxUserId: account?.robloxUserId ?? targetSlug,
            username: account?.username ?? targetSlug,
            displayName: account?.displayName ?? null,
            publicViews: account?.publicViews ?? {},
          },
          summary: normalizedSummary,
          views: {
            profile: profileView ?? null,
            inventory: inventoryView ?? null,
            extendedProfile: extendedProfileView ?? null,
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
