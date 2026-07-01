import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ---------------- CONFIG ---------------- */

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;

const ROBLOX_USERS_API = "https://users.roblox.com/v1/users";
const ROBLOX_THUMB_API =
  "https://thumbnails.roblox.com/v1/users/avatar-headshot";

const CACHE_TTL = 180 * 1000; // 3 minutes

/* ---------------- CACHE ---------------- */

let cache: any = null;
let cacheTime = 0;
let inFlight: Promise<any> | null = null;

/* ---------------- HELPERS ---------------- */

type Contribution = {
  UserID?: number | string;
  Points?: number | string;
};

function fetchJson(url: string) {
  return fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`Failed ${url}`);
    return r.json();
  });
}

/* ---------------- ROBLOX HELPERS ---------------- */

async function getNames(userIds: number[]) {
  const map = new Map<number, string>();

  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);

    try {
      const res = await fetch(ROBLOX_USERS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: chunk }),
        cache: "no-store",
      });

      if (!res.ok) continue;

      const data = await res.json();

      for (const u of data?.data ?? []) {
        map.set(Number(u.id), u.name);
      }
    } catch {}
  }

  return map;
}

async function getAvatars(userIds: number[]) {
  const map = new Map<number, string>();

  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);

    try {
      const res = await fetch(
        `${ROBLOX_THUMB_API}?userIds=${chunk.join(
          ","
        )}&size=420x420&format=Png&isCircular=true`,
        { cache: "no-store" }
      );

      if (!res.ok) continue;

      const data = await res.json();

      for (const r of data?.data ?? []) {
        map.set(Number(r.targetId), r.imageUrl);
      }
    } catch {}
  }

  return map;
}

/* ---------------- ROUTE ---------------- */

export async function GET() {
  try {
    const now = Date.now();

    if (cache && now - cacheTime < CACHE_TTL) {
      return NextResponse.json(cache);
    }

    if (inFlight) {
      return NextResponse.json(await inFlight);
    }

    inFlight = (async () => {
      const [war, clan] = await Promise.all([
        fetchJson(ACTIVE_BATTLE_API),
        fetchJson(CLAN_API),
      ]);

      const battles = clan?.data?.Battles ?? {};

      const battle =
        Object.values(battles).find((b: any) => b?.PointContributions?.length) ??
        Object.values(battles)[0];

      const contributions: Contribution[] = (
        battle?.PointContributions ?? []
      ).sort((a, b) => Number(b.Points || 0) - Number(a.Points || 0));

      const userIds = [
        ...new Set(contributions.map((c) => Number(c.UserID))),
      ].filter(Boolean);

      const [names, avatars] = await Promise.all([
        getNames(userIds),
        getAvatars(userIds),
      ]);

      const entries = contributions.map((c, i) => {
        const id = Number(c.UserID);

        return {
          rank: i + 1,
          user_id: id,
          name: names.get(id) ?? `Unknown (${id})`,
          points: Number(c.Points || 0),
          avatar: avatars.get(id) ?? null,
          discord_id: null,
        };
      });

      const result = {
        success: true,
        title:
          war?.data?.configData?.Title ??
          war?.data?.configData?.configName ??
          "MCWV War",
        total_points: contributions.reduce(
          (a, b) => a + Number(b.Points || 0),
          0
        ),
        updatedAt: new Date().toISOString(),
        data: entries,
      };

      cache = result;
      cacheTime = Date.now();
      inFlight = null;

      return result;
    })();

    const data = await inFlight;

    return NextResponse.json(data);
  } catch (err) {
    inFlight = null;

    return NextResponse.json({
      success: false,
      error: String(err),
      data: [],
    });
  }
}
