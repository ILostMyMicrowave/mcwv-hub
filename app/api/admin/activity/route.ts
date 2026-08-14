import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RosterRow = {
  roblox_id: string;
  username: string | null;
  discord_id: string | null;
  is_alt: boolean;
  owner_username: string | null;
  owner_roblox_id: string | null;
};

type SnapshotRow = {
  roblox_id: string;
  username: string | null;
  points: string | number | null;
  rank: string | number | null;
  captured_at: Date | string;
};

type StatusRow = {
  roblox_id: string;
  status: string | number | null;
  updated_at: Date | string | null;
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function toIso(value: Date | string | null | undefined) {
  const ms = toMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function normalizeStatus(value: unknown) {
  const numeric = Number(value);
  if (numeric === 0) return { label: "Offline", tone: "offline" };
  if (numeric === 1) return { label: "Online", tone: "online" };
  if (numeric === 2) return { label: "In Game", tone: "ingame" };
  if (numeric === 3) return { label: "In Studio", tone: "studio" };
  const raw = String(value ?? "").trim();
  return { label: raw || "Unknown", tone: "unknown" };
}

function pointsAtTime(rows: Array<{ points: number; time: number }>, targetMs: number) {
  const sorted = [...rows].sort((a, b) => a.time - b.time);
  if (!sorted.length) return null;
  if (targetMs < sorted[0].time) return null;

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.time === targetMs) return current.points;
    const next = sorted[index + 1];
    if (!next) return current.points;
    if (current.time <= targetMs && targetMs <= next.time) {
      const span = next.time - current.time;
      if (span <= 0) return current.points;
      const ratio = (targetMs - current.time) / span;
      return current.points + (next.points - current.points) * ratio;
    }
  }

  return sorted[sorted.length - 1].points;
}

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

async function getRoster() {
  const rows: RosterRow[] = [];

  const main = await pool.query<RosterRow>(
    `SELECT
       TRIM(CAST(roblox_id AS TEXT)) AS roblox_id,
       username::text AS username,
       discord_id::text AS discord_id,
       false AS is_alt,
       NULL::text AS owner_username,
       NULL::text AS owner_roblox_id
     FROM users
     WHERE roblox_id IS NOT NULL
       AND TRIM(CAST(roblox_id AS TEXT)) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM mcwv_loa_records l
         WHERE l.active = TRUE
           AND l.roblox_id = TRIM(CAST(users.roblox_id AS TEXT))
       )`
  );
  rows.push(...main.rows);

  if (await tableExists("user_alts")) {
    const alts = await pool.query<RosterRow>(
      `SELECT
         TRIM(CAST(a.roblox_id AS TEXT)) AS roblox_id,
         a.username::text AS username,
         a.discord_id::text AS discord_id,
         true AS is_alt,
         u.username::text AS owner_username,
         u.roblox_id::text AS owner_roblox_id
       FROM user_alts a
       LEFT JOIN users u ON u.discord_id::text = a.discord_id::text
       WHERE a.roblox_id IS NOT NULL
         AND TRIM(CAST(a.roblox_id AS TEXT)) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM mcwv_loa_records l
           WHERE l.active = TRUE
             AND l.roblox_id = TRIM(CAST(a.roblox_id AS TEXT))
         )`
    );
    rows.push(...alts.rows);
  }

  const deduped = new Map<string, RosterRow>();
  for (const row of rows) {
    if (!row.roblox_id) continue;
    const existing = deduped.get(row.roblox_id);
    if (!existing || (existing.is_alt && !row.is_alt)) deduped.set(row.roblox_id, row);
  }

  return [...deduped.values()];
}

export async function GET(req: Request) {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  try {
    const thresholdParam = new URL(req.url).searchParams.get("threshold");
    const threshold = Math.max(0, Number(thresholdParam ?? 100) || 100);
    const roster = await getRoster();
    const ids = roster.map((row) => row.roblox_id).filter(Boolean);

    if (!ids.length || !(await tableExists("player_leaderboard_history"))) {
      return NextResponse.json({
        success: true,
        threshold,
        battleId: null,
        updatedAt: new Date().toISOString(),
        summary: { roster: roster.length, needsAttention: 0, lowPph: 0, zeroPoints: 0, offline: 0, disconnectWatch: 0 },
        needsAttention: [],
        lowPph: [],
        zeroPoints: [],
        offline: [],
        disconnects: [],
        topImprovers: [],
      });
    }

    const latestBattle = await pool.query<{ battle_id: string | null }>(
      `SELECT battle_id
       FROM player_leaderboard_history
       WHERE points IS NOT NULL
       ORDER BY captured_at DESC
       LIMIT 1`
    );
    const battleId = latestBattle.rows[0]?.battle_id ?? null;

    if (!battleId) {
      return NextResponse.json({ success: true, threshold, battleId: null, updatedAt: new Date().toISOString(), summary: { roster: roster.length, needsAttention: 0, lowPph: 0, zeroPoints: 0, offline: 0, disconnectWatch: 0 }, needsAttention: [], lowPph: [], zeroPoints: [], offline: [], disconnects: [], topImprovers: [] });
    }

    const [latestSnapshots, recentHistory, statuses, disconnectRows] = await Promise.all([
      pool.query<SnapshotRow>(
        `SELECT DISTINCT ON (roblox_id)
           roblox_id::text AS roblox_id,
           username,
           points,
           rank,
           captured_at
         FROM player_leaderboard_history
         WHERE battle_id = $1
           AND roblox_id::text = ANY($2)
           AND points IS NOT NULL
         ORDER BY roblox_id, captured_at DESC`,
        [battleId, ids]
      ),
      pool.query<SnapshotRow>(
        `SELECT roblox_id::text AS roblox_id, username, points, rank, captured_at
         FROM player_leaderboard_history
         WHERE battle_id = $1
           AND roblox_id::text = ANY($2)
           AND points IS NOT NULL
           AND captured_at >= NOW() - INTERVAL '2 hours'
         ORDER BY roblox_id, captured_at ASC`,
        [battleId, ids]
      ),
      tableExists("user_status").then((exists) => exists
        ? pool.query<StatusRow>(
            `SELECT roblox_id::text AS roblox_id, status, updated_at
             FROM user_status
             WHERE roblox_id::text = ANY($1)`,
            [ids]
          )
        : Promise.resolve({ rows: [] as StatusRow[] })
      ),
      tableExists("player_presence_events").then((exists) => exists
        ? pool.query<{ roblox_id: string; count24h: string; count1h: string }>(
            `SELECT
               roblox_id::text AS roblox_id,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS count24h,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::text AS count1h
             FROM player_presence_events
             WHERE roblox_id::text = ANY($1)
               AND created_at >= NOW() - INTERVAL '24 hours'
               AND LOWER(COALESCE(previous_status::text, '')) IN ('in_game', 'ingame', '2')
               AND LOWER(COALESCE(next_status::text, '')) IN ('offline', 'online', '0', '1')
             GROUP BY roblox_id::text`,
            [ids]
          )
        : Promise.resolve({ rows: [] as Array<{ roblox_id: string; count24h: string; count1h: string }> })
      ),
    ]);

    const latestById = new Map(latestSnapshots.rows.map((row) => [row.roblox_id, row]));
    const statusById = new Map(statuses.rows.map((row) => [row.roblox_id, row]));
    const disconnectById = new Map(disconnectRows.rows.map((row) => [row.roblox_id, row]));
    const historyById = new Map<string, Array<{ points: number; time: number }>>();

    for (const row of recentHistory.rows) {
      const time = toMs(row.captured_at);
      if (time === null) continue;
      const list = historyById.get(row.roblox_id) ?? [];
      list.push({ points: asNumber(row.points), time });
      historyById.set(row.roblox_id, list);
    }

    const members = roster.map((row) => {
      const latest = latestById.get(row.roblox_id);
      const points = latest ? asNumber(latest.points) : 0;
      const latestTime = toMs(latest?.captured_at);
      const history = historyById.get(row.roblox_id) ?? [];
      const baseline60 = latestTime === null ? null : pointsAtTime(history, latestTime - 60 * 60 * 1000);
      const baseline5 = latestTime === null ? null : pointsAtTime(history, latestTime - 5 * 60 * 1000);
      const pphReady = baseline60 !== null;
      const pph = pphReady ? Math.max(0, Math.round(points - baseline60)) : 0;
      const change5m = baseline5 !== null ? Math.max(0, Math.round(points - baseline5)) : 0;
      const statusRow = statusById.get(row.roblox_id);
      const status = normalizeStatus(statusRow?.status);
      const disconnects = disconnectById.get(row.roblox_id);
      const disconnects24h = Number(disconnects?.count24h ?? 0) || 0;
      const disconnects1h = Number(disconnects?.count1h ?? 0) || 0;
      const reasons: string[] = [];

      if (points <= 0) reasons.push("Zero points");
      if (pphReady && points > 0 && pph < threshold) reasons.push(`Below ${threshold} PPH`);
      if (status.tone === "offline") reasons.push("Offline");
      if (disconnects1h > 0) reasons.push(`${disconnects1h} disconnect(s) in 1h`);

      return {
        robloxId: row.roblox_id,
        username: row.username ?? row.roblox_id,
        avatarUrl: `/api/roblox/avatar?userId=${encodeURIComponent(row.roblox_id)}`,
        discordId: row.discord_id,
        isAlt: row.is_alt,
        ownerUsername: row.owner_username,
        ownerRobloxId: row.owner_roblox_id,
        points,
        rank: latest ? asNumber(latest.rank) || null : null,
        pph,
        pphReady,
        change5m,
        status: status.label,
        statusTone: status.tone,
        statusUpdatedAt: toIso(statusRow?.updated_at),
        disconnects24h,
        disconnects1h,
        reasons,
        needsAttention: reasons.length > 0,
      };
    });

    const needsAttention = members
      .filter((member) => member.needsAttention)
      .sort((a, b) => Number(b.reasons.includes("Zero points")) - Number(a.reasons.includes("Zero points")) || a.pph - b.pph || b.disconnects1h - a.disconnects1h);
    const lowPph = members.filter((member) => member.pphReady && member.points > 0 && member.pph < threshold).sort((a, b) => a.pph - b.pph);
    const zeroPoints = members.filter((member) => member.points <= 0).sort((a, b) => a.username.localeCompare(b.username));
    const offline = members.filter((member) => member.statusTone === "offline").sort((a, b) => a.username.localeCompare(b.username));
    const disconnects = members.filter((member) => member.disconnects24h > 0).sort((a, b) => b.disconnects24h - a.disconnects24h);
    const topImprovers = members.filter((member) => member.pphReady && member.pph > 0).sort((a, b) => b.pph - a.pph).slice(0, 20);

    return NextResponse.json({
      success: true,
      threshold,
      battleId,
      updatedAt: new Date().toISOString(),
      summary: {
        roster: members.length,
        needsAttention: needsAttention.length,
        lowPph: lowPph.length,
        zeroPoints: zeroPoints.length,
        offline: offline.length,
        disconnectWatch: disconnects.length,
      },
      needsAttention: needsAttention.slice(0, 50),
      lowPph: lowPph.slice(0, 50),
      zeroPoints: zeroPoints.slice(0, 50),
      offline: offline.slice(0, 50),
      disconnects: disconnects.slice(0, 50),
      topImprovers,
    });
  } catch (err) {
    console.error("[api/admin/activity] error:", err);
    return NextResponse.json({ error: "Failed to load activity dashboard" }, { status: 500 });
  }
}
