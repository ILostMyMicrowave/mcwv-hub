import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PS99_API = process.env.PS99_API!;
const CLAN_API = process.env.CLAN_API!;
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const ROBLOX_USERS_API = "https://users.roblox.com/v1/users";

type WarConfig = {
  StartTime?: number | string;
  FinishTime?: number | string;
  Title?: string;
  configName?: string;
};

type BattleContribution = {
  UserID?: number | string;
  Points?: number | string;
};

type Battle = {
  StartTime?: number | string;
  FinishTime?: number | string;
  PointContributions?: BattleContribution[];
};

type LeaderboardEntry = {
  rank: number;
  user_id: number;
  name: string;
  points: number;
  avatar: string | null;
  discord_id: string | null;
};

function normalizeTimestamp(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new Error(`Fetch failed for ${url}: HTTP ${res.status}`);
  }
  return res.json();
}

function getBattleCandidates(clanData: any): any[] {
  const root = clanData?.data ?? clanData ?? {};
  const candidates: any[] = [];

  for (const key of [
    "ActiveBattle",
    "activeBattle",
    "CurrentBattle",
    "currentBattle",
    "Battle",
    "battle",
  ]) {
    if (root?.[key]) candidates.push(root[key]);
  }

  const battles = root?.Battles;
  if (battles && typeof battles === "object") {
    candidates.push(...Object.values(battles as Record<string, any>));
  }

  return candidates.filter(Boolean);
}

async function getRobloxNames(userIds: number[]) {
  const map = new Map<number, string>();
  const unique = [...new Set(userIds)].filter((n) => Number.isFinite(n));

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);

    try {
      const res = await fetch(ROBLOX_USERS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userIds: chunk,
          excludeBannedUsers: false,
        }),
        cache: "no-store",
      });

      if (!res.ok) continue;

      const data = await res.json();
      const rows = Array.isArray(data?.data) ? data.data : [];

      for (const row of rows) {
        const id = Number(row?.id);
        const name = String(row?.name ?? `Unknown (${id})`);
        if (Number.isFinite(id)) map.set(id, name);
      }
    } catch {
      continue;
    }
  }

  return map;
}

async function getRobloxAvatars(userIds: number[]) {
  const map = new Map<number, string>();
  const unique = [...new Set(userIds)].filter((n) => Number.isFinite(n));

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);

    try {
      const url =
        `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
        `?userIds=${chunk.join(",")}&size=420x420&format=Png&isCircular=true`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;

      const data = await res.json();
      const rows = Array.isArray(data?.data) ? data.data : [];

      for (const row of rows) {
        const id = Number(row?.targetId);
        const imageUrl = String(row?.imageUrl ?? "");
        if (Number.isFinite(id) && imageUrl) map.set(id, imageUrl);
      }
    } catch {
      continue;
    }
  }

  return map;
}

export async function GET() {
  try {
    const [war_data, clan_data] = await Promise.all([
      fetchJson(ACTIVE_BATTLE_API),
      fetchJson(CLAN_API),
    ]);

    const config: WarConfig = war_data?.data?.configData ?? {};

    const start = normalizeTimestamp(config.StartTime);
    const finish = normalizeTimestamp(config.FinishTime);
    const now = Math.floor(Date.now() / 1000);

    const isActive = start > 0 && finish > 0 ? start <= now && now <= finish : true;

    if (!isActive) {
      return NextResponse.json({
        success: true,
        active: false,
        title: String(config.Title ?? config.configName ?? "MCWV War"),
        total_points: 0,
        updatedAt: new Date().toISOString(),
        data: [],
      });
    }

    const candidates = getBattleCandidates(clan_data);

    const battle =
      candidates.find((b) => {
        const bs = normalizeTimestamp(b?.StartTime);
        const be = normalizeTimestamp(b?.FinishTime);
        const contributions = Array.isArray(b?.PointContributions) ? b.PointContributions : [];

        if (bs > 0 && be > 0) return bs <= now && now <= be;
        return contributions.length > 0;
      }) ?? candidates[0] ?? null;

    const rawContributions: BattleContribution[] = Array.isArray(battle?.PointContributions)
      ? battle.PointContributions
      : [];

    if (!rawContributions.length) {
      return NextResponse.json({
        success: true,
        active: true,
        title: String(config.Title ?? config.configName ?? "MCWV War"),
        total_points: 0,
        updatedAt: new Date().toISOString(),
        data: [],
      });
    }

    const contributions = rawContributions
      .filter((e): e is BattleContribution => !!e && typeof e === "object")
      .sort((a, b) => Number(b.Points ?? 0) - Number(a.Points ?? 0));

    const userIds = contributions
      .map((e) => Number(e.UserID))
      .filter((n) => Number.isFinite(n));

    const [nameMap, avatarMap] = await Promise.all([
      getRobloxNames(userIds),
      getRobloxAvatars(userIds),
    ]);

    const total_points = contributions.reduce(
      (sum, entry) => sum + Number(entry.Points ?? 0),
      0
    );

    const entries: LeaderboardEntry[] = contributions.map((entry, index) => {
      const user_id = Number(entry.UserID ?? 0);
      const points = Number(entry.Points ?? 0);

      return {
        rank: index + 1,
        user_id,
        name: nameMap.get(user_id) ?? `Unknown (${user_id})`,
        points,
        avatar: avatarMap.get(user_id) ?? null,
        discord_id: null, // ready to be filled once you wire the users table mapping
      };
    });

    return NextResponse.json({
      success: true,
      active: true,
      title: String(config.Title ?? config.configName ?? "MCWV War"),
      total_points,
      updatedAt: new Date().toISOString(),
      data: entries,
    });
  } catch (err) {
    console.error("Leaderboard API ERROR:", err);

    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
      data: [],
    });
  }
}
