import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV";
const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`;
const CLAN_API = process.env.CLAN_API ?? `${PS99_API}/api/clan/${encodeURIComponent(CLAN_NAME)}`;
const LEGACY_CLAN_API = `${PS99_API}/api/clan/${encodeURIComponent(CLAN_NAME)}`;
const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;
type Grade = typeof GRADES[number];

type BattleRow = {
  battle_id: string;
  battle_name: string | null;
  start_time: Date | string | null;
  end_time: Date | string | null;
  is_active: boolean | null;
};

type WarSnapshotRow = {
  rank: number | string | null;
  battle_points: number | string | null;
  captured_at: Date | string | null;
};

type PlayerSnapshotRow = {
  roblox_id: string;
  username: string | null;
  rank: number | string | null;
  points: number | string | null;
  captured_at: Date | string | null;
};

type LinkedAccount = {
  robloxId: string;
  username: string;
  discordId: string | null;
  isAlt: boolean;
  ownerUsername: string | null;
  ownerRobloxId: string | null;
};

type OverrideRow = {
  roblox_id: string;
  manual_grade: string | null;
  staff_note: string | null;
  updated_at: Date | string | null;
  updated_by_username: string | null;
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateFromTimestamp(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const ms = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBattleKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function fetchRobloxNames(userIds: string[]) {
  const ids = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const names = new Map<string, string>();

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    try {
      const res = await fetch("https://users.roblox.com/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "MCWV-Hub/1.0" },
        body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false }),
        cache: "no-store",
      });

      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const rows = Array.isArray(json?.data) ? json.data : [];
      for (const row of rows) {
        const id = row?.id;
        const name = row?.name ?? row?.displayName;
        if (id !== null && id !== undefined && typeof name === "string" && name.trim()) {
          names.set(String(id), name.trim());
        }
      }
    } catch {
      // Keep numeric fallback.
    }
  }

  return names;
}

async function fetchJsonOrNull(url: string) {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

async function getActiveBattleRow(): Promise<BattleRow | null> {
  const [v1, legacy] = await Promise.all([
    fetchJsonOrNull(`${PS99_API}/v1/clans/players`),
    fetchJsonOrNull(ACTIVE_BATTLE_API),
  ]);

  const legacyData = legacy?.data ?? {};
  const config = legacyData?.configData ?? {};
  const battleId =
    v1?.data?.activeBattleConfigName ??
    legacyData?.configName ??
    legacyData?.activeBattleConfigName ??
    legacyData?.activeBattleId ??
    legacyData?.battleId ??
    null;

  if (!battleId) return null;

  const start = toDateFromTimestamp(config?.StartTime ?? legacyData?.startTime ?? v1?.data?.startTime);
  const end = toDateFromTimestamp(config?.FinishTime ?? legacyData?.finishTime ?? v1?.data?.finishTime);
  const now = Date.now();
  const isActive = start && end ? start.getTime() <= now && now <= end.getTime() : true;
  if (!isActive) return null;

  return {
    battle_id: String(battleId),
    battle_name: String(config?.Title ?? legacyData?.title ?? battleId),
    start_time: start,
    end_time: end,
    is_active: true,
  };
}

async function getClanBattleReportData(battleId: string, includeCurrentRoster: boolean) {
  // Always prefer the official legacy clan endpoint. For live wars we use the
  // current in-game roster (Members + Owner). For completed wars we use that
  // battle's PointContributions as the historical roster source so newer/current
  // members do not leak into old reports like Gummy.
  const json = (await fetchJsonOrNull(LEGACY_CLAN_API)) ?? (await fetchJsonOrNull(CLAN_API));
  const data = json?.data ?? {};
  const members = Array.isArray(data?.Members) ? data.Members : [];
  const currentMemberIds = new Set<string>();

  const ownerIdRaw = data?.Owner ?? data?.owner ?? data?.OwnerUserID ?? data?.ownerUserId;
  const ownerId = ownerIdRaw !== null && ownerIdRaw !== undefined && String(ownerIdRaw).trim()
    ? String(ownerIdRaw).trim()
    : null;

  if (ownerId) currentMemberIds.add(ownerId);

  for (const member of members) {
    const id = member?.UserID ?? member?.userId ?? member?.id;
    if (id !== null && id !== undefined && String(id).trim()) {
      currentMemberIds.add(String(id).trim());
    }
  }

  const battles = data?.Battles ?? data?.battles ?? {};
  const targetKey = normalizeBattleKey(battleId);
  const battle = Object.entries(battles).find(([key, value]) => {
    const record = value as Record<string, unknown>;
    const candidates = [key, record?.BattleID, record?.battleId, record?.configName, record?.Title, record?.title];
    return candidates.some((candidate) => normalizeBattleKey(candidate) === targetKey);
  })?.[1] as Record<string, unknown> | undefined;

  const contributionPoints = new Map<string, number>();
  const contributionIds = new Set<string>();
  const contributions = Array.isArray(battle?.PointContributions)
    ? battle.PointContributions
    : Array.isArray(battle?.pointContributions)
    ? battle.pointContributions
    : [];

  for (const contribution of contributions) {
    const entry = contribution as Record<string, unknown>;
    const id = entry?.UserID ?? entry?.userId ?? entry?.user_id;
    if (id === null || id === undefined || !String(id).trim()) continue;
    const normalizedId = String(id).trim();
    contributionIds.add(normalizedId);
    contributionPoints.set(normalizedId, asNumber(entry?.Points ?? entry?.points));
  }

  const memberIds = includeCurrentRoster
    ? new Set(currentMemberIds.size ? currentMemberIds : contributionIds)
    : new Set(contributionIds);

  // The Big Games Members array does not include the clan owner, so explicitly
  // keep them in both live and historical reports when we have battle data.
  if (ownerId && (includeCurrentRoster || memberIds.size > 0)) {
    memberIds.add(ownerId);
  }

  return {
    memberIds,
    contributionPoints,
    battleFound: Boolean(battle),
    battlePoints: asNumber(battle?.Points ?? battle?.points),
    ownerId,
  };
}


function formatBattleTitle(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Historical War";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d{4})$/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getFallbackBattleFromHistory(requestedBattleId: string): Promise<BattleRow | null> {
  const requestedKey = normalizeBattleKey(decodeURIComponent(requestedBattleId));
  if (!requestedKey) return null;

  if (await tableExists("player_leaderboard_history")) {
    const result = await pool.query<{ battle_id: string; captured_at: Date | string | null }>(
      `SELECT battle_id, MAX(captured_at) AS captured_at
       FROM player_leaderboard_history
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
          OR regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') LIKE ($1 || '%')
          OR $1 LIKE (regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') || '%')
       GROUP BY battle_id
       ORDER BY MAX(captured_at) DESC
       LIMIT 1`,
      [requestedKey]
    );

    const row = result.rows[0];
    if (row?.battle_id) {
      return {
        battle_id: row.battle_id,
        battle_name: formatBattleTitle(row.battle_id),
        start_time: null,
        end_time: null,
        is_active: false,
      };
    }
  }

  if (await tableExists("war_snapshots")) {
    const result = await pool.query<{ battle_id: string; captured_at: Date | string | null }>(
      `SELECT battle_id, MAX(captured_at) AS captured_at
       FROM war_snapshots
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
          OR regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') LIKE ($1 || '%')
          OR $1 LIKE (regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') || '%')
       GROUP BY battle_id
       ORDER BY MAX(captured_at) DESC
       LIMIT 1`,
      [requestedKey]
    );

    const row = result.rows[0];
    if (row?.battle_id) {
      return {
        battle_id: row.battle_id,
        battle_name: formatBattleTitle(row.battle_id),
        start_time: null,
        end_time: null,
        is_active: false,
      };
    }
  }

  return null;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function gradeRank(grade: string) {
  const index = GRADES.indexOf(grade as Grade);
  return index === -1 ? GRADES.length : index;
}

function betterGrade(a: Grade, b: Grade): Grade {
  return gradeRank(a) <= gradeRank(b) ? a : b;
}

function computeAutoGrade(points: number, rank: number, average: number, med: number): Grade {
  if (points <= 0) return "F";
  if (rank <= 3) return "A+";

  let grade: Grade;
  if (points >= average) grade = "A";
  else if (points >= med) grade = "B";
  else if (points >= med * 0.5) grade = "C";
  else grade = "D";

  if (rank <= 10) grade = betterGrade(grade, "A");
  return grade;
}

function gradeDistribution(members: Array<{ grade: string }>) {
  return GRADES.map((grade) => ({
    grade,
    count: members.filter((member) => member.grade === grade).length,
  }));
}

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

async function ensureOverridesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS war_report_member_overrides (
      id BIGSERIAL PRIMARY KEY,
      battle_id TEXT NOT NULL,
      roblox_id TEXT NOT NULL,
      manual_grade TEXT,
      staff_note TEXT,
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (battle_id, roblox_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS war_report_member_overrides_battle_idx ON war_report_member_overrides (battle_id)`);
}

async function getLinkedAccounts() {
  const accounts = new Map<string, LinkedAccount>();

  const users = await pool.query<{
    roblox_id: string | null;
    username: string | null;
    discord_id: string | number | null;
  }>(
    `SELECT TRIM(CAST(roblox_id AS TEXT)) AS roblox_id, username, discord_id
     FROM users
     WHERE roblox_id IS NOT NULL
       AND TRIM(CAST(roblox_id AS TEXT)) <> ''`
  );

  for (const row of users.rows) {
    if (!row.roblox_id) continue;
    accounts.set(String(row.roblox_id), {
      robloxId: String(row.roblox_id),
      username: row.username ?? String(row.roblox_id),
      discordId: row.discord_id === null || row.discord_id === undefined ? null : String(row.discord_id),
      isAlt: false,
      ownerUsername: null,
      ownerRobloxId: null,
    });
  }

  if (await tableExists("user_alts")) {
    const alts = await pool.query<{
      roblox_id: string | null;
      username: string | null;
      discord_id: string | number | null;
      owner_username: string | null;
      owner_roblox_id: string | number | null;
    }>(
      `SELECT
         TRIM(CAST(a.roblox_id AS TEXT)) AS roblox_id,
         a.username,
         a.discord_id,
         u.username AS owner_username,
         u.roblox_id AS owner_roblox_id
       FROM user_alts a
       LEFT JOIN users u ON u.discord_id::text = a.discord_id::text
       WHERE a.roblox_id IS NOT NULL
         AND TRIM(CAST(a.roblox_id AS TEXT)) <> ''`
    );

    for (const row of alts.rows) {
      if (!row.roblox_id || accounts.has(String(row.roblox_id))) continue;
      accounts.set(String(row.roblox_id), {
        robloxId: String(row.roblox_id),
        username: row.username ?? String(row.roblox_id),
        discordId: row.discord_id === null || row.discord_id === undefined ? null : String(row.discord_id),
        isAlt: true,
        ownerUsername: row.owner_username ?? null,
        ownerRobloxId: row.owner_roblox_id === null || row.owner_roblox_id === undefined ? null : String(row.owner_roblox_id),
      });
    }
  }

  return accounts;
}

function buildWarningMessage(members: Array<{ discordId: string | null; warning: boolean }>) {
  const mentions = [...new Set(members.filter((member) => member.warning && member.discordId).map((member) => `<@${member.discordId}>`))];
  if (!mentions.length) return "";
  return [
    "The following members were below average or had low contribution this war and need to improve next war:",
    "",
    mentions.join(" "),
    "",
    "Please lock in next war. Repeated low contribution may lead to removal.",
  ].join("\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { battleId } = await params;
  const canManage = auth.user.role === "officer" || auth.user.role === "owner";

  try {
    await ensureOverridesTable();

    let battle: BattleRow | null = null;

    if (await tableExists("battles")) {
      const battleResult = await pool.query<BattleRow>(
        `SELECT
           battle_id,
           battle_name,
           start_time,
           end_time,
           (end_time IS NOT NULL AND end_time > NOW()) AS is_active
         FROM battles
         WHERE (
             battle_id = $1
             OR regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = regexp_replace(lower($1), '[^a-z0-9]+', '', 'g')
             OR regexp_replace(lower(COALESCE(battle_name, '')), '[^a-z0-9]+', '', 'g') = regexp_replace(lower($1), '[^a-z0-9]+', '', 'g')
           )
           AND end_time IS NOT NULL
           AND (
             end_time <= NOW()
             OR (start_time IS NULL OR start_time <= NOW())
           )
         ORDER BY end_time DESC NULLS LAST
         LIMIT 1`,
        [decodeURIComponent(battleId)]
      );
      battle = battleResult.rows[0] ?? null;
    }

    if (!battle) {
      const activeBattle = await getActiveBattleRow();
      const requested = normalizeBattleKey(decodeURIComponent(battleId));
      const activeKeys = activeBattle
        ? [activeBattle.battle_id, activeBattle.battle_name, formatBattleTitle(activeBattle.battle_name || activeBattle.battle_id), "current", "active"]
            .map(normalizeBattleKey)
        : [];

      if (
        activeBattle &&
        (
          activeKeys.includes(requested) ||
          activeKeys.some((key) => requested.length >= 4 && key.length >= 4 && (key.includes(requested) || requested.includes(key)))
        )
      ) {
        battle = activeBattle;
      }
    }

    if (!battle) {
      battle = await getFallbackBattleFromHistory(battleId);
    }

    if (!battle) {
      return NextResponse.json(
        {
          error: "Report not found yet. If this is the live war, wait for the first player snapshot or open it from /war-reports.",
        },
        { status: 404 }
      );
    }

    const reportBattleKey = normalizeBattleKey(battle.battle_id);

    const snapshotResult = await pool.query<WarSnapshotRow>(
      `SELECT rank, battle_points, captured_at
       FROM war_snapshots
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
         AND LOWER(clan_name) = LOWER($2)
       ORDER BY captured_at DESC
       LIMIT 1`,
      [reportBattleKey, CLAN_NAME]
    );
    const snapshot = snapshotResult.rows[0] ?? null;

    const linkedAccounts = await getLinkedAccounts();
    let playerRows: PlayerSnapshotRow[] = [];

    if (await tableExists("player_leaderboard_history")) {
      const players = await pool.query<PlayerSnapshotRow>(
        `SELECT DISTINCT ON (roblox_id)
           roblox_id,
           username,
           rank,
           points,
           captured_at
         FROM (
           SELECT
             roblox_id::text AS roblox_id,
             username,
             rank,
             points,
             captured_at
           FROM player_leaderboard_history
           WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
             AND points IS NOT NULL
         ) rows
         ORDER BY roblox_id, captured_at DESC`,
        [normalizeBattleKey(battle.battle_id)]
      );
      playerRows = players.rows;
    }

    const clanBattleData = await getClanBattleReportData(battle.battle_id, Boolean(battle.is_active));
    if (clanBattleData.memberIds.size > 0) {
      const reportIds = [...clanBattleData.memberIds];
      const reportNames = await fetchRobloxNames(reportIds);
      const rowsById = new Map(playerRows.map((row) => [String(row.roblox_id), row]));
      playerRows = reportIds.map((robloxId) => {
        const existing = rowsById.get(robloxId);
        const linked = linkedAccounts.get(robloxId);
        return {
          roblox_id: robloxId,
          username: existing?.username ?? linked?.username ?? reportNames.get(robloxId) ?? robloxId,
          rank: existing?.rank ?? null,
          points: clanBattleData.contributionPoints.get(robloxId) ?? asNumber(existing?.points),
          captured_at: existing?.captured_at ?? null,
        };
      });
    }

    playerRows.sort((a, b) => asNumber(b.points) - asNumber(a.points));

    if (!battle.is_active && playerRows.length === 0) {
      return NextResponse.json(
        { error: "This completed battle has no stored player report data." },
        { status: 404 }
      );
    }

    const pointValues = playerRows.map((row) => asNumber(row.points));
    const average = pointValues.length ? pointValues.reduce((sum, value) => sum + value, 0) / pointValues.length : 0;
    const med = median(pointValues);
    const totalMemberPoints = pointValues.reduce((sum, value) => sum + value, 0);

    const overridesResult = await pool.query<OverrideRow>(
      `SELECT o.roblox_id, o.manual_grade, o.staff_note, o.updated_at, u.username AS updated_by_username
       FROM war_report_member_overrides o
       LEFT JOIN users u ON u.id = o.updated_by
       WHERE o.battle_id = $1`,
      [battle.battle_id]
    );
    const overrides = new Map(overridesResult.rows.map((row) => [String(row.roblox_id), row]));

    const members = playerRows.map((row, index) => {
      const linked = linkedAccounts.get(String(row.roblox_id));
      const points = asNumber(row.points);
      const rank = index + 1;
      const autoGrade = computeAutoGrade(points, rank, average, med);
      const override = overrides.get(String(row.roblox_id));
      const manualGrade = GRADES.includes(String(override?.manual_grade ?? "") as Grade)
        ? String(override?.manual_grade) as Grade
        : null;
      const grade = manualGrade ?? autoGrade;
      const flags: string[] = [];

      if (rank <= 3) flags.push("MVP");
      if (rank <= 10) flags.push("Top 10");
      else if (rank <= 25) flags.push("Top 25");
      if (points > 0 && points >= average) flags.push("Above Avg");
      if (points > 0 && points < average) flags.push("Below Avg");
      if (points > 0 && grade === "D") flags.push("Low Contribution");
      if (points <= 0) flags.push("Zero Points");
      if (linked?.isAlt) flags.push("Alt");
      if (!linked) flags.push("Unlinked");
      else if (!linked.discordId) flags.push("No Discord");

      const warning = points < average || grade === "D" || grade === "F";
      if (warning) flags.push("Needs Review");

      return {
        rank,
        robloxId: String(row.roblox_id),
        username: linked?.username ?? row.username ?? String(row.roblox_id),
        avatarUrl: `/api/roblox/avatar?userId=${encodeURIComponent(String(row.roblox_id))}`,
        discordId: linked?.discordId ?? null,
        isAlt: linked?.isAlt ?? false,
        ownerUsername: linked?.ownerUsername ?? null,
        ownerRobloxId: linked?.ownerRobloxId ?? null,
        points,
        sharePct: totalMemberPoints > 0 ? (points / totalMemberPoints) * 100 : 0,
        autoGrade,
        manualGrade,
        grade,
        flags,
        warning,
        staffNote: canManage ? override?.staff_note ?? "" : undefined,
        noteUpdatedAt: canManage ? toIso(override?.updated_at) : undefined,
        noteUpdatedBy: canManage ? override?.updated_by_username ?? null : undefined,
      };
    });

    const distribution = gradeDistribution(members);
    const warningMessage = canManage ? buildWarningMessage(members) : "";

    return NextResponse.json({
      success: true,
      canManage,
      battle: {
        battleId: battle.battle_id,
        battleName: formatBattleTitle(battle.battle_name || battle.battle_id),
        startTime: toIso(battle.start_time),
        endTime: toIso(battle.end_time),
        finalRank: snapshot?.rank === null || snapshot?.rank === undefined ? null : asNumber(snapshot.rank),
        finalPoints: battle.is_active
          ? totalMemberPoints
          : asNumber(snapshot?.battle_points) || clanBattleData.battlePoints || totalMemberPoints,
        capturedAt: toIso(snapshot?.captured_at),
        isActive: Boolean(battle.is_active),
      },
      summary: {
        accounts: members.length,
        participants: members.filter((member) => member.points > 0).length,
        zeroAccounts: members.filter((member) => member.points <= 0).length,
        averagePoints: Math.round(average),
        medianPoints: Math.round(med),
        totalMemberPoints,
        mvp: members.slice(0, 3),
      },
      distribution,
      members,
      warningMessage,
    });
  } catch (err) {
    console.error("[war-reports] detail error:", err);
    return NextResponse.json({ success: false, error: "Failed to load war report" }, { status: 500 });
  }
}
