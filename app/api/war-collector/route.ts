import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

const BASE = "https://ps99.biggamesapi.io";
const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const DATABASE_URL = process.env.DATABASE_URL;
const COLLECT_SECRET = process.env.WAR_COLLECT_SECRET ?? "";

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
    })
  : null;

type ClanStanding = {
  rank: number | null;
  name: string;
  icon: string | null;
  countryCode: string | null;
  members?: number | null;
  memberCapacity?: number | null;
  points: number;
  reportedPlace: number | null;
  medal: string | null;
  contributorCount?: number | null;
};

type BattleMeta = {
  battleId: string | null;
  battleName: string | null;
  startTime: Date | null;
  endTime: Date | null;
  progressPct: number | null;
  totalClans: number | null;
  totalPoints: number | null;
  participants: number | null;
};

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function namesMatch(a: unknown, b: unknown): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

function toDate(value: unknown): Date | null {
  const ms = toMs(value);
  if (ms === null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeHeaders() {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  return headers;
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } finally {
    clearTimeout(timer);
  }
}

function mapBattleClan(raw: any, rank: number): ClanStanding {
  return {
    rank: asNumber(raw?.rank) ?? rank,
    name: String(raw?.name ?? raw?.clanName ?? raw?.tag ?? CLAN_NAME),
    icon: raw?.icon ?? null,
    countryCode: raw?.countryCode ?? raw?.country ?? null,
    members: asNumber(raw?.members) ?? null,
    memberCapacity: asNumber(raw?.memberCapacity) ?? null,
    points: asNumber(raw?.points) ?? 0,
    reportedPlace: asNumber(raw?.reportedPlace) ?? asNumber(raw?.place) ?? rank,
    medal: raw?.medal ?? null,
    contributorCount: asNumber(raw?.contributorCount) ?? null,
  };
}

function buildClanFromLegacyDetail(raw: any, fallbackName: string): {
  name: string;
  icon: string | null;
  level: number | null;
  lastKickTimestamp: number | null;
  membersCount: number | null;
  countryCode: string | null;
  battlePoints: number | null;
} {
  const battleArray = asArray(raw?.Contribution?.Battle);
  const battlePoints = battleArray.reduce(
    (sum, entry) => sum + (asNumber(entry?.Points) ?? 0),
    0
  );

  return {
    name: String(raw?.Name ?? fallbackName),
    icon: raw?.Icon ?? null,
    level: asNumber(raw?.GuildLevel) ?? null,
    lastKickTimestamp: asNumber(raw?.LastKickTimestamp) ?? null,
    membersCount: asNumber(Array.isArray(raw?.Members) ? raw.Members.length : null) ?? null,
    countryCode: raw?.CountryCode ?? null,
    battlePoints,
  };
}

async function getActiveBattleId() {
  const json = await fetchJson<any>(`${BASE}/api/activeClanBattle`);
  return {
    battleId: json?.data?.configName ?? null,
    raw: json,
  };
}

async function getBattleMeta(battleId: string): Promise<BattleMeta> {
  const json = await fetchJson<any>(`${BASE}/v1/clans/battles/${encodeURIComponent(battleId)}`);
  const data = json?.data ?? {};
  const meta = data?.meta ?? {};
  const stats = data?.stats ?? {};

  const startTime = toDate(meta?.startTime);
  const endTime = toDate(meta?.finishTime);

  const progressPct =
    startTime && endTime && endTime.getTime() > startTime.getTime()
      ? clamp(
          ((Date.now() - startTime.getTime()) /
            (endTime.getTime() - startTime.getTime())) * 100,
          0,
          100
        )
      : null;

  return {
    battleId,
    battleName: String(meta?.title ?? meta?.name ?? meta?.id ?? battleId),
    startTime,
    endTime,
    progressPct,
    totalClans: asNumber(stats?.participatingClans) ?? null,
    totalPoints: asNumber(stats?.totalClanPoints) ?? null,
    participants: asNumber(stats?.totalContributors) ?? null,
  };
}

async function getBattleClans(battleId: string) {
  const json = await fetchJson<any>(`${BASE}/v1/clans/battles/${encodeURIComponent(battleId)}`);
  const data = json?.data ?? {};
  return asArray(data?.topClans).map((raw: any, index: number) =>
    mapBattleClan(raw, index + 1)
  );
}

async function getClanDetails(clanName: string) {
  return fetchJson<any>(`${BASE}/api/clan/${encodeURIComponent(clanName)}`);
}

async function getLastSnapshot(battleId: string, clanName: string) {
  if (!pool) return null;

  const client = await pool.connect();
  try {
    const res = await client.query<{
      rank: number | null;
      battle_points: number | null;
      captured_at: Date;
    }>(
      `SELECT rank, battle_points, captured_at
       FROM war_snapshots
       WHERE battle_id = $1
         AND LOWER(clan_name) = LOWER($2)
       ORDER BY captured_at DESC
       LIMIT 1`,
      [battleId, clanName]
    );

    return res.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function saveCollectorSnapshot(params: {
  battleId: string;
  battleName: string | null;
  startTime: Date | null;
  endTime: Date | null;
  clanName: string;
  rank: number | null;
  points: number;
  participants: number | null;
  totalClans: number | null;
  totalPoints: number | null;
  progressPct: number | null;
  foundInSample: boolean;
  clans: ClanStanding[];
}) {
  if (!pool) return;

  const client = await pool.connect();
  const capturedAt = new Date();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO battles (battle_id, battle_name, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (battle_id)
       DO UPDATE SET
         battle_name = COALESCE(EXCLUDED.battle_name, battles.battle_name),
         start_time = COALESCE(EXCLUDED.start_time, battles.start_time),
         end_time = COALESCE(EXCLUDED.end_time, battles.end_time)`,
      [params.battleId, params.battleName, params.startTime, params.endTime]
    );

    await client.query(
      `INSERT INTO war_snapshots (
        battle_id,
        clan_name,
        captured_at,
        rank,
        battle_points,
        participants,
        total_clans,
        total_points,
        progress_percent,
        found_in_sample
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        params.battleId,
        params.clanName,
        capturedAt,
        params.rank,
        params.points,
        params.participants,
        params.totalClans,
        params.totalPoints,
        params.progressPct,
        params.foundInSample,
      ]
    );

    if (params.clans.length > 0) {
      const values: unknown[] = [];
      const placeholders = params.clans
        .map((clan, index) => {
          const base = index * 5;
          values.push(
            params.battleId,
            clan.name,
            clan.rank,
            clan.points,
            capturedAt
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        })
        .join(", ");

      await client.query(
        `INSERT INTO clan_history (battle_id, clan_name, rank, points, captured_at)
         VALUES ${placeholders}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("Failed to save collector snapshot");
  } finally {
    client.release();
  }
}

export async function GET(request: Request) {
  try {
    if (COLLECT_SECRET) {
      const url = new URL(request.url);
      const provided = url.searchParams.get("secret");
      if (provided !== COLLECT_SECRET) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401, headers: makeHeaders() }
        );
      }
    }

    const active = await getActiveBattleId();
    const battleId = active.battleId;

    if (!battleId) {
      return NextResponse.json(
        {
          success: true,
          active: false,
          message: "No active battle found.",
        },
        { headers: makeHeaders() }
      );
    }

    const [battleMeta, clanDetails, battleClans] = await Promise.all([
      getBattleMeta(battleId),
      getClanDetails(CLAN_NAME),
      getBattleClans(battleId),
    ]);

    const clanDetail = clanDetails?.data ?? null;
    const normalizedClan = clanDetail
      ? buildClanFromLegacyDetail(clanDetail, CLAN_NAME)
      : {
          name: CLAN_NAME,
          icon: null,
          level: null,
          lastKickTimestamp: null,
          membersCount: null,
          countryCode: null,
          battlePoints: null,
        };

    const historical = await getLastSnapshot(battleId, CLAN_NAME);

    const liveClan =
      battleClans.find((c) => namesMatch(c.name, CLAN_NAME)) ?? null;

    const rank = liveClan?.reportedPlace ?? historical?.rank ?? null;
    const points =
      liveClan?.points ??
      historical?.battle_points ??
      normalizedClan.battlePoints ??
      0;

    const foundInSample = Boolean(liveClan);
    const clansForHistory = battleClans;

    await saveCollectorSnapshot({
      battleId,
      battleName: battleMeta.battleName,
      startTime: battleMeta.startTime,
      endTime: battleMeta.endTime,
      clanName: normalizedClan.name,
      rank,
      points,
      participants: battleMeta.participants,
      totalClans: battleMeta.totalClans,
      totalPoints: battleMeta.totalPoints,
      progressPct: battleMeta.progressPct,
      foundInSample,
      clans: clansForHistory,
    });

    return NextResponse.json(
      {
        success: true,
        active: true,
        battleId,
        battleName: battleMeta.battleName,
        clan: {
          name: normalizedClan.name,
          rank,
          points,
          level: normalizedClan.level,
          lastKickTimestamp: normalizedClan.lastKickTimestamp,
          membersCount: normalizedClan.membersCount,
          countryCode: normalizedClan.countryCode,
          icon: normalizedClan.icon,
        },
        battle: {
          startTime: battleMeta.startTime?.toISOString() ?? null,
          endTime: battleMeta.endTime?.toISOString() ?? null,
          progressPct: battleMeta.progressPct,
          participants: battleMeta.participants,
          totalClans: battleMeta.totalClans,
          totalPoints: battleMeta.totalPoints,
        },
        source: {
          foundInLeaderboard: foundInSample,
          historicalFallbackUsed: !foundInSample && Boolean(historical),
          lastHistoricalRank: historical?.rank ?? null,
          lastHistoricalPoints: historical?.battle_points ?? null,
          lastHistoricalSeenAt: historical?.captured_at?.toISOString() ?? null,
        },
      },
      { headers: makeHeaders() }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Collector failed",
      },
      { status: 500, headers: makeHeaders() }
    );
  }
}
