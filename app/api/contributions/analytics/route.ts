import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
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

async function hasActiveWar() {
  try {
    const res = await fetch(ACTIVE_BATTLE_API, { cache: "no-store" });
    if (!res.ok) return false;

    const json = asRecord(await res.json().catch(() => null));
    const data = asRecord(json.data);
    const config = asRecord(data.configData);
    const start = normalizeTimestamp(config.StartTime);
    const finish = normalizeTimestamp(config.FinishTime);
    const now = Math.floor(Date.now() / 1000);

    if (start > 0 && finish > 0) return start <= now && now <= finish;
    return Boolean(data.activeBattleConfigName ?? data.activeBattleId ?? data.battleId);
  } catch {
    return false;
  }
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
  try {
    const activeWar = await hasActiveWar();

    if (!activeWar) {
      return NextResponse.json(zeroPayload(false), {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

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
        `
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
        GROUP BY h.hour_bucket
        ORDER BY h.hour_bucket
        `
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
        GROUP BY d.day_bucket
        ORDER BY d.day_bucket
        `
      ),
      pool.query<TopContributorRow>(
        `
        SELECT
          ph.user_id,
          MAX(u.username) AS username,
          COALESCE(SUM(ph.points_added), 0) AS points
        FROM point_history ph
        LEFT JOIN users u ON TRIM(CAST(u.roblox_id AS TEXT)) = TRIM(CAST(ph.user_id AS TEXT))
        GROUP BY ph.user_id
        ORDER BY points DESC
        LIMIT 10
        `
      ),
    ]);

    const statsRow = statsRes.rows[0] ?? {};
    const clanTotal = toNumber(statsRow.clan_total);
    const pointsLastHour = toNumber(statsRow.points_last_hour);
    const pointsToday = toNumber(statsRow.points_today);
    const trackedMembers = toNumber(statsRow.tracked_members);
    const clanAverage = trackedMembers > 0 ? clanTotal / trackedMembers : 0;

    const hourlyPoints: HourPoint[] = hourlyRes.rows.map((row) => ({
      hour: String(row.hour ?? ""),
      points: toNumber(row.points),
    }));

    const dailyPoints: DayPoint[] = dailyRes.rows.map((row) => ({
      day: String(row.day ?? ""),
      points: toNumber(row.points),
    }));

    const topRows = topRes.rows.map((row) => ({
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
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
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
