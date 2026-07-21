import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  points: number;
};

type AnalyticsResponse = {
  success: boolean;
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

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
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
      pool.query(
        `
        SELECT
          user_id,
          COALESCE(SUM(points_added), 0) AS points
        FROM point_history
        GROUP BY user_id
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

    const topContributors: TopContributor[] = topRes.rows.map((row) => ({
      user_id: toNumber(row.user_id),
      points: toNumber(row.points),
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
        success: false,
        updatedAt: new Date().toISOString(),
        range: {
          from: new Date().toISOString(),
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
        hourlyPoints: [],
        dailyPoints: [],
        topContributors: [],
        insights: {
          peakHour: null,
          peakHourPoints: 0,
        },
        error: "Failed to load analytics data",
      },
      { status: 500 }
    );
  }
}
