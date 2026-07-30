import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { pool } from "@/lib/db";
import { getDetectedWarWindow } from "@/lib/warDetection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const CLAN_API = process.env.CLAN_API ?? "";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const ROBLOX_USERS_API = "https://users.roblox.com/v1/users";

type HourPoint = {
  hour: string;
  points: number;
};

type DayPoint = {
  day: string;
  points: number;
};

type TopContributor = {
  user_id: number;
  username: string;
  points: number;
};

type AnalyticsResponse = {
  success: boolean;
  active: boolean;
  updatedAt: string;
  range: {
    from: string;
    to: string;
  };
  stats: {
    pointsLastHour: number;
    pointsToday: number;
    clanTotal: number;
    clanAverage: number;
    trackedMembers: number;
    growthVsPreviousHour: number;
  };
  hourlyPoints: HourPoint[];
  dailyPoints: DayPoint[];
  topContributors: TopContributor[];
  insights: {
    peakHour: string | null;
    peakHourPoints: number;
  };
  error?: string;
};

type TopContributorRow = {
  user_id: number | string;
  username?: string | null;
  points: number | string;
};

type Contribution = {
  UserID?: number | string;
  Points?: number | string;
};

type Battle = {
  BattleID?: string;
  Title?: string;
  configName?: string;
  Points?: number | string;
  PointContributions?: Contribution[];
};

type ActiveWarInfo = {
  active: boolean;
  battleId: string;
  title: string;
  startIso: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTimestamp(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getContributionPoints(entry: Contribution) {
  return toNumber(entry.Points);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${url}: HTTP ${res.status}`);
  return res.json();
}

function buildZeroHours() {
  const hours: HourPoint[] = [];
  const base = new Date();
  base.setMinutes(0, 0, 0);

  for (let i = 23; i >= 0; i -= 1) {
    const date = new Date(base.getTime() - i * 60 * 60 * 1000);
    hours.push({
      hour: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
      points: 0,
    });
  }

  return hours;
}

function buildZeroDays() {
  const days: DayPoint[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(base.getTime() - i * 24 * 60 * 60 * 1000);
    days.push({
      day: date.toISOString().slice(0, 10),
      points: 0,
    });
  }

  return days;
}

function zeroPayload(active = false): AnalyticsResponse {
  return {
    success: true,
    active,
    updatedAt: new Date().toISOString(),
    range: {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
    },
    stats: {
      pointsLastHour: 0,
      pointsToday: 0,
      clanTotal: 0,
      clanAverage: 0,
      trackedMembers: 0,
      growthVsPreviousHour: 0,
    },
    hourlyPoints: buildZeroHours(),
    dailyPoints: buildZeroDays(),
    topContributors: [],
    insights: {
      peakHour: null,
      peakHourPoints: 0,
    },
  };
}

async function getActiveWarInfo(): Promise<ActiveWarInfo | null> {
  try {
    const res = await fetch(ACTIVE_BATTLE_API, { cache: "no-store" });
    if (!res.ok) return null;

    const json = asRecord(await res.json().catch(() => null));
    const data = asRecord(json.data);
    const config = asRecord(data.configData);
    const start = normalizeTimestamp(config.StartTime);
    const finish = normalizeTimestamp(config.FinishTime);
    const now = Math.floor(Date.now() / 1000);
    const active = start > 0 && finish > 0
      ? start <= now && now <= finish
      : Boolean(data.activeBattleConfigName ?? data.activeBattleId ?? data.battleId);

    if (!active || start <= 0) return null;

    const title = String(config.Title ?? config.configName ?? data.configName ?? data.activeBattleConfigName ?? "");
    const battleId = String(config._id ?? config.Title ?? data.configName ?? title);
    const detectedWindow = await getDetectedWarWindow({
      battleId,
      battleName: title,
      apiStart: start,
      apiEnd: finish > 0 ? finish : null,
    });

    return {
      active: true,
      battleId,
      title,
      startIso: detectedWindow?.startIso ?? new Date(start * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

async function getLiveClanStats(activeWar: ActiveWarInfo) {
  if (!CLAN_API) return null;

  try {
    const clan = await fetchJson(CLAN_API);
    const battles = (clan?.data?.Battles ?? {}) as Record<string, Battle>;
    const target = normalizeKey(activeWar.title);
    const match = Object.entries(battles).find(([key, battle]) => {
      const names = [key, battle?.BattleID, battle?.configName, battle?.Title];
      return names.some((name) => normalizeKey(name) === target);
    });

    const battle = match?.[1];
    if (!battle) return null;

    const contributions = Array.isArray(battle.PointContributions)
      ? battle.PointContributions
          .filter((entry): entry is Contribution => !!entry && typeof entry === "object")
          .map((entry) => ({
            user_id: toNumber(entry.UserID),
            points: getContributionPoints(entry),
          }))
          .filter((entry) => entry.user_id > 0)
      : [];

    return {
      totalPoints: toNumber(battle.Points) || contributions.reduce((sum, entry) => sum + entry.points, 0),
      contributors: contributions.filter((entry) => entry.points > 0).length,
      topContributors: contributions
        .filter((entry) => entry.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10),
    };
  } catch (err) {
    console.warn("[contributions/analytics] live clan stats unavailable:", err);
    return null;
  }
}

async function getSnapshotStats(activeWar: ActiveWarInfo, currentTotal: number | null | undefined) {
  const current = Number(currentTotal ?? 0);
  if (!Number.isFinite(current) || current <= 0) {
    return { pointsLastHour: 0, pointsToday: 0, hourlyPoints: null as HourPoint[] | null, dailyPoints: null as DayPoint[] | null };
  }

  try {
    const exists = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.war_snapshots') IS NOT NULL AS exists`
    );
    if (!exists.rows[0]?.exists) {
      return {
        pointsLastHour: 0,
        pointsToday: current,
        hourlyPoints: null,
        dailyPoints: null,
      };
    }

    const rows = await pool.query<{ battle_points: string | number; captured_at: Date | string }>(
      `SELECT battle_points, captured_at
       FROM war_snapshots
       WHERE battle_id = $1
         AND LOWER(clan_name) = LOWER($2)
         AND battle_points IS NOT NULL
       ORDER BY captured_at ASC`,
      [activeWar.battleId, "MCWV"]
    );

    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const battleStart = new Date(activeWar.startIso).getTime();
    const todayOrBattleStart = Math.max(dayStart.getTime(), Number.isFinite(battleStart) ? battleStart : 0);

    const normalized = rows.rows
      .map((row) => ({ points: toNumber(row.battle_points), time: new Date(row.captured_at).getTime() }))
      .filter((row) => Number.isFinite(row.time) && row.points >= 0)
      .sort((a, b) => a.time - b.time);

    const valueAtOrBefore = (time: number) => [...normalized].reverse().find((row) => row.time <= time) ?? null;
    const valueAtOrAfter = (time: number) => normalized.find((row) => row.time >= time) ?? null;
    const baselineFor = (time: number) => valueAtOrBefore(time) ?? valueAtOrAfter(time);

    const beforeHour = baselineFor(hourAgo);
    const beforeToday = baselineFor(todayOrBattleStart);

    const hourlyPoints = buildZeroHours().map((bucket) => {
      const [hour] = bucket.hour.split(":");
      const end = new Date();
      end.setHours(Number(hour), 59, 59, 999);
      if (end.getTime() > now + 60 * 60 * 1000) end.setDate(end.getDate() - 1);
      const start = new Date(end);
      start.setMinutes(0, 0, 0);
      const startValue = baselineFor(start.getTime());
      const endValue = valueAtOrBefore(Math.min(end.getTime(), now));
      return {
        hour: bucket.hour,
        points: startValue && endValue ? Math.max(0, endValue.points - startValue.points) : 0,
      };
    });

    const dailyPoints = buildZeroDays().map((bucket) => {
      const start = new Date(`${bucket.day}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
      const startValue = baselineFor(Math.max(start.getTime(), battleStart));
      const endValue = valueAtOrBefore(Math.min(end.getTime(), now));
      return {
        day: bucket.day,
        points: startValue && endValue ? Math.max(0, endValue.points - startValue.points) : 0,
      };
    });

    return {
      pointsLastHour: beforeHour ? Math.max(0, current - beforeHour.points) : 0,
      pointsToday: beforeToday ? Math.max(0, current - beforeToday.points) : current,
      hourlyPoints,
      dailyPoints,
    };
  } catch {
    return {
      pointsLastHour: 0,
      pointsToday: current,
      hourlyPoints: null,
      dailyPoints: null,
    };
  }
}

function ensureVisibleHourlyData(points: HourPoint[], currentTotal: number) {
  if (currentTotal <= 0) return points;
  if (points.some((point) => point.points > 0)) return points;

  const next = points.length ? [...points] : buildZeroHours();
  next[next.length - 1] = { ...next[next.length - 1], points: currentTotal };
  return next;
}

function ensureVisibleDailyData(points: DayPoint[], currentTotal: number) {
  if (currentTotal <= 0) return points;
  if (points.some((point) => point.points > 0)) return points;

  const next = points.length ? [...points] : buildZeroDays();
  next[next.length - 1] = { ...next[next.length - 1], points: currentTotal };
  return next;
}

async function getRobloxNames(userIds: number[]) {
  const names = new Map<number, string>();
  const uniqueIds = [...new Set(userIds)].filter((id) => Number.isFinite(id) && id > 0);

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);

    try {
      const res = await fetch(ROBLOX_USERS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false }),
        cache: "no-store",
      });

      if (!res.ok) continue;
      const payload = asRecord(await res.json().catch(() => null));
      const data = Array.isArray(payload.data) ? payload.data : [];

      for (const item of data) {
        const row = asRecord(item);
        const id = toNumber(row.id);
        const name = String(row.name ?? "");
        if (id > 0 && name) names.set(id, name);
      }
    } catch {
      continue;
    }
  }

  return names;
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const activeWar = await getActiveWarInfo();

    if (!activeWar) {
      return NextResponse.json(zeroPayload(false), {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const liveStats = await getLiveClanStats(activeWar);
    const battleStart = activeWar.startIso;
    const snapshotStats = await getSnapshotStats(activeWar, liveStats?.totalPoints ?? null);

    const [
      statsRes,
      hourlyRes,
      dailyRes,
      topRes,
    ] = await Promise.all([
      pool.query(
        `
        SELECT
          COALESCE(SUM(points_added), 0) AS clan_total,
          COALESCE(SUM(points_added) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour'), 0) AS points_last_hour,
          COALESCE(SUM(points_added) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0) AS points_today,
          COUNT(DISTINCT user_id) AS tracked_members
        FROM point_history
        WHERE created_at >= $1::timestamptz
        `,
        [battleStart]
      ),
      pool.query(
        `
        WITH hours AS (
          SELECT generate_series(
            date_trunc('hour', NOW()) - INTERVAL '23 hours',
            date_trunc('hour', NOW()),
            INTERVAL '1 hour'
          ) AS hour_bucket
        )
        SELECT
          to_char(h.hour_bucket, 'HH24:00') AS hour,
          COALESCE(SUM(p.points_added), 0) AS points
        FROM hours h
        LEFT JOIN point_history p
          ON date_trunc('hour', p.created_at) = h.hour_bucket
         AND p.created_at >= $1::timestamptz
        GROUP BY h.hour_bucket
        ORDER BY h.hour_bucket
        `,
        [battleStart]
      ),
      pool.query(
        `
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', NOW()) - INTERVAL '6 days',
            date_trunc('day', NOW()),
            INTERVAL '1 day'
          ) AS day_bucket
        )
        SELECT
          to_char(d.day_bucket, 'YYYY-MM-DD') AS day,
          COALESCE(SUM(p.points_added), 0) AS points
        FROM days d
        LEFT JOIN point_history p
          ON date_trunc('day', p.created_at) = d.day_bucket
         AND p.created_at >= $1::timestamptz
        GROUP BY d.day_bucket
        ORDER BY d.day_bucket
        `,
        [battleStart]
      ),
      pool.query<TopContributorRow>(
        `
        SELECT
          ph.user_id,
          MAX(u.username) AS username,
          COALESCE(SUM(ph.points_added), 0) AS points
        FROM point_history ph
        LEFT JOIN users u ON TRIM(CAST(u.roblox_id AS TEXT)) = TRIM(CAST(ph.user_id AS TEXT))
        WHERE ph.created_at >= $1::timestamptz
        GROUP BY ph.user_id
        ORDER BY points DESC
        LIMIT 10
        `,
        [battleStart]
      ),
    ]);

    const statsRow = statsRes.rows[0] ?? {};
    const clanTotal = liveStats?.totalPoints ?? toNumber(statsRow.clan_total);
    const pointsLastHour = Math.max(toNumber(statsRow.points_last_hour), snapshotStats.pointsLastHour);
    const pointsToday = Math.max(toNumber(statsRow.points_today), snapshotStats.pointsToday);
    const trackedMembers = liveStats?.contributors ?? toNumber(statsRow.tracked_members);
    const clanAverage = trackedMembers > 0 ? clanTotal / trackedMembers : 0;

    const hourlyPoints: HourPoint[] = ensureVisibleHourlyData(
      snapshotStats.hourlyPoints ?? hourlyRes.rows.map((row) => ({
        hour: String(row.hour ?? ""),
        points: toNumber(row.points),
      })),
      clanTotal
    );

    const dailyPoints: DayPoint[] = ensureVisibleDailyData(
      snapshotStats.dailyPoints ?? dailyRes.rows.map((row) => ({
        day: String(row.day ?? ""),
        points: toNumber(row.points),
      })),
      clanTotal
    );

    const topRows = liveStats?.topContributors.length
      ? liveStats.topContributors.map((row) => ({
          user_id: row.user_id,
          username: "",
          points: row.points,
        }))
      : topRes.rows.map((row) => ({
          user_id: toNumber(row.user_id),
          username: row.username ? String(row.username) : "",
          points: toNumber(row.points),
        }));
    const robloxNames = await getRobloxNames(topRows.map((row) => row.user_id));

    const topContributors: TopContributor[] = topRows.map((row) => ({
      user_id: row.user_id,
      username: robloxNames.get(row.user_id) ?? row.username ?? `Unknown (${row.user_id})`,
      points: row.points,
    }));

    let peakHour = null as string | null;
    let peakHourPoints = 0;

    for (const item of hourlyPoints) {
      if (item.points > peakHourPoints) {
        peakHourPoints = item.points;
        peakHour = item.hour;
      }
    }

    const previousHourPoints = hourlyPoints.length >= 2
      ? hourlyPoints[hourlyPoints.length - 2].points
      : 0;

    const payload: AnalyticsResponse = {
      success: true,
      active: true,
      updatedAt: new Date().toISOString(),
      range: {
        from: battleStart,
        to: new Date().toISOString(),
      },
      stats: {
        pointsLastHour,
        pointsToday,
        clanTotal,
        clanAverage,
        trackedMembers,
        growthVsPreviousHour: pointsLastHour - previousHourPoints,
      },
      hourlyPoints,
      dailyPoints,
      topContributors,
      insights: {
        peakHour,
        peakHourPoints,
      },
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[contributions/analytics] error:", err);
    return NextResponse.json(
      {
        ...zeroPayload(false),
        success: false,
        error: "Failed to load analytics data",
      },
      { status: 500 }
    );
  }
}
