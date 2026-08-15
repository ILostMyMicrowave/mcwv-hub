import { pool } from "@/lib/db"

// ---------------------------------------------------------------------------
// War context pack — everything the assistant knows about the war right now.
// Shared clan data is cached briefly (API-friendly); asker stats are per-user.
// Every section fails soft: if an API or table is missing, fields come back
// null and the assistant just says less.
// ---------------------------------------------------------------------------

const PS99_API = process.env.PS99_API ?? "https://ps99.biggamesapi.io"
const CLAN_NAME = process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV"
const CLAN_API = `${PS99_API}/api/clan/${encodeURIComponent(CLAN_NAME)}`
const ACTIVE_BATTLE_API = `${PS99_API}/api/activeClanBattle`
const CLANS_LEADERBOARD_API = `${PS99_API}/api/clans?page=1&pageSize=100&sort=Points&sortOrder=desc`

const SHARED_CACHE_MS = 90_000

export type RewardTier = { best: number; worst: number; label: string }
export type StandingRow = { rank: number; name: string; points: number; pph: number | null }
export type MemberLine = {
  robloxId: string
  username: string
  points: number
  rank: number | null
  gain24h: number | null
  capturedAt: number | null /* internal: scorer-window math, never shown */
}

export type AskerContext = {
  username: string
  robloxId: string | null
  points: number | null
  rank: number | null
  gapToNext: number | null
  nextPlayer: string | null
  gain24h: number | null
  inRoster: boolean
  wars: AskerWar[] /* newest ended war first, [] when unknown */
}

export type AskerWar = { title: string; points: number; endedAt: string | null }

export type WarHistoryEntry = {
  battleId: string
  title: string
  endedAt: string | null
  scorers: number
  clanPoints: number
  topUsername: string | null
  topPoints: number | null
}

export type SharedWarContext = {
  generatedAt: string
  active: boolean
  battleId: string | null
  timeLeftMs: number | null
  endsAt: string | null
  clanRank: number | null
  clanPoints: number | null
  memberCount: number | null
  sampleClans: number
  gainLastHour: number | null
  gainLast24h: number | null
  hourlyRate: number | null
  projectedFinalPoints: number | null
  projectedRankIfPaceHolds: number | null
  standings: StandingRow[]
  rewards: RewardTier[]
  topScorers: MemberLine[]
  movers: MemberLine[]
  members: MemberLine[]
  zeroCount: number
  zeroNames: string[]
  contributors: number | null
  history: WarHistoryEntry[] /* ended wars, newest first; [] when tables missing */
}

type Json = Record<string, unknown>

async function fetchJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return (await res.json()) as Json
  } catch {
    return null
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toEpochSeconds(value: unknown): number | null {
  let num = asNumber(value)
  if (num === null) return null
  if (num > 10_000_000_000) num = Math.floor(num / 1000)
  return num
}

function normalizeBattleKey(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function normalizeClanName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Interpolate a clan's points at an exact timestamp from its captured history.
// Mirrors the bot's hourly-card baseline math: returns null when the target
// time is before the oldest snapshot (no full 60-minute baseline yet).
function pointsAtTime(
  rows: Array<{ capturedAt: number; points: number }>,
  targetMs: number
): number | null {
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => a.capturedAt - b.capturedAt)
  if (targetMs < sorted[0].capturedAt) return null
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    if (cur.capturedAt === targetMs) return cur.points
    const nxt = sorted[i + 1]
    if (!nxt) return cur.points
    if (cur.capturedAt <= targetMs && targetMs <= nxt.capturedAt) {
      const span = Math.max(nxt.capturedAt - cur.capturedAt, 1)
      const ratio = (targetMs - cur.capturedAt) / span
      return cur.points + (nxt.points - cur.points) * ratio
    }
  }
  return sorted[sorted.length - 1].points
}

// Per-clan PPH from clan_history (populated every minute by the war collector).
// Returns a map keyed by normalized clan name -> points gained in the last 60min.
// Falls back to the latest stored battle if the live battleId doesn't match a
// stored row yet (e.g. a war that just started). Fails soft: empty map on any
// error / missing table, so the assistant just says less.
async function getClanPphMap(battleId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!battleId) return map
  try {
    let result = await pool.query<{ clan_name: string; points: number | string; captured_at: Date | string }>(
      `SELECT clan_name, points, captured_at
       FROM clan_history
       WHERE battle_id = $1
         AND captured_at >= NOW() - INTERVAL '3 hours'
       ORDER BY clan_name ASC, captured_at ASC`,
      [battleId]
    )

    // Live battleId may not match a stored row yet (fresh war, or id text
    // differs). Use the most recent stored battle as a fallback so rival pace
    // is still available.
    if (!result.rows.length) {
      result = await pool.query<{ clan_name: string; points: number | string; captured_at: Date | string }>(
        `SELECT ch.clan_name, ch.points, ch.captured_at
         FROM clan_history ch
         JOIN LATERAL (
           SELECT battle_id
           FROM battles
           ORDER BY COALESCE(end_time, start_time, created_at, NOW()) DESC
           LIMIT 1
         ) b ON true
         WHERE ch.captured_at >= NOW() - INTERVAL '3 hours'
         ORDER BY ch.clan_name ASC, ch.captured_at ASC`
      )
    }

    if (!result.rows.length) return map

    const grouped = new Map<string, Array<{ capturedAt: number; points: number }>>()
    for (const row of result.rows) {
      const key = normalizeClanName(row.clan_name)
      if (!key) continue
      const d = row.captured_at instanceof Date ? row.captured_at : new Date(String(row.captured_at))
      if (Number.isNaN(d.getTime())) continue
      const list = grouped.get(key) ?? []
      list.push({ capturedAt: d.getTime(), points: asNumber(row.points) ?? 0 })
      grouped.set(key, list)
    }

    for (const [key, history] of grouped.entries()) {
      if (history.length < 2) continue
      const sorted = history.sort((a, b) => a.capturedAt - b.capturedAt)
      const latest = sorted[sorted.length - 1]
      const baseline = pointsAtTime(sorted, latest.capturedAt - 60 * 60 * 1000)
      if (baseline === null) continue
      const pph = Math.max(0, Math.round(latest.points - baseline))
      if (pph > 0) map.set(key, pph)
    }
  } catch (err) {
    console.warn("[warContext] clan pph map unavailable:", err)
  }
  return map
}

function tierLabel(item: Json | undefined): string | null {
  const data = (item?._data ?? {}) as Json
  const id = typeof data.id === "string" ? data.id : null
  if (!id) return null
  const pt = asNumber(data.pt)
  if (pt === 2) return `Rainbow ${id}`
  if (pt === 1) return `Golden ${id}`
  return id
}

function parseRewardTiers(configData: Json | null): RewardTier[] {
  const raw = configData?.PlacementRewards
  if (!Array.isArray(raw)) return []
  const tiers: RewardTier[] = []
  for (const entry of raw as Json[]) {
    const best = asNumber(entry.Best)
    const worst = asNumber(entry.Worst)
    const label = tierLabel(entry.Item as Json | undefined)
    if (best === null || worst === null || !label) continue
    tiers.push({ best, worst, label })
  }
  tiers.sort((a, b) => a.best - b.best || a.worst - b.worst)
  return tiers
}

async function latestSnapshot(battleKey: string) {
  try {
    const result = await pool.query(
      `SELECT battle_points, rank, participants, total_clans, captured_at
       FROM war_snapshots
       WHERE clan_name = $1
         AND lower(battle_id) = $2
       ORDER BY captured_at DESC
       LIMIT 1`,
      [CLAN_NAME, battleKey]
    )
    return result.rows[0] ?? null
  } catch {
    return null
  }
}

async function snapshotNear(battleKey: string, epochSeconds: number) {
  try {
    const result = await pool.query(
      `SELECT battle_points, captured_at
       FROM war_snapshots
       WHERE clan_name = $1
         AND lower(battle_id) = $2
       ORDER BY ABS(EXTRACT(EPOCH FROM captured_at) - $3) ASC
       LIMIT 1`,
      [CLAN_NAME, battleKey, epochSeconds]
    )
    return result.rows[0] ?? null
  } catch {
    return null
  }
}

async function memberLines(battleKey: string): Promise<MemberLine[]> {
  try {
    const latest = await pool.query(
      `SELECT h.roblox_id, h.username, h.points, h.rank, h.captured_at
       FROM users u
       JOIN LATERAL (
         SELECT roblox_id, username, points, rank, captured_at
         FROM player_leaderboard_history
         WHERE battle_id = $1
           AND roblox_id = TRIM(u.roblox_id)
         ORDER BY captured_at DESC
         LIMIT 1
       ) h ON TRUE
       WHERE u.roblox_id IS NOT NULL`,
      [battleKey]
    )

    const dayAgo = await pool.query(
      `SELECT h.roblox_id, h.points
       FROM users u
       JOIN LATERAL (
         SELECT roblox_id, points
         FROM player_leaderboard_history
         WHERE battle_id = $1
           AND roblox_id = TRIM(u.roblox_id)
           AND captured_at <= NOW() - INTERVAL '24 hours'
         ORDER BY captured_at DESC
         LIMIT 1
       ) h ON TRUE
       WHERE u.roblox_id IS NOT NULL`,
      [battleKey]
    )

    const prior = new Map<string, number>()
    for (const row of dayAgo.rows as Json[]) {
      const id = String(row.roblox_id ?? "")
      const pts = asNumber(row.points)
      if (id && pts !== null) prior.set(id, pts)
    }

    const lines: MemberLine[] = []
    for (const row of latest.rows as Json[]) {
      const robloxId = String(row.roblox_id ?? "")
      if (!robloxId) continue
      const points = asNumber(row.points) ?? 0
      const before = prior.get(robloxId) ?? null
      const captured = row.captured_at ? new Date(String(row.captured_at)).getTime() : NaN
      lines.push({
        robloxId,
        username: String(row.username ?? robloxId),
        points,
        rank: asNumber(row.rank),
        gain24h: before === null ? null : points - before,
        capturedAt: Number.isFinite(captured) ? captured : null,
      })
    }
    lines.sort((a, b) => b.points - a.points)
    return lines
  } catch {
    return []
  }
}

let sharedCache: { at: number; context: SharedWarContext } | null = null

// --- War history brain ------------------------------------------------------
// Per-war finals computed from each member's LAST snapshot inside that battle
// (plus 12h grace). Everything fails soft: missing tables just mean no history.

const HISTORY_SQL = `
  WITH recent AS (
    SELECT battle_id, battle_name, end_time
    FROM battles
    WHERE end_time IS NOT NULL AND end_time <= NOW()
    ORDER BY end_time DESC
    LIMIT $1
  )
  SELECT rb.battle_id, rb.battle_name, rb.end_time,
         a.scorers, a.clan_points, t.top_username, t.top_points
  FROM recent rb
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE h.points > 0)::int AS scorers,
           COALESCE(SUM(h.points), 0)::float8 AS clan_points
    FROM users u
    JOIN LATERAL (
      SELECT hh.points
      FROM player_leaderboard_history hh
      WHERE hh.battle_id = lower(rb.battle_id)
        AND hh.roblox_id = TRIM(u.roblox_id)
        AND hh.captured_at <= rb.end_time + INTERVAL '12 hours'
      ORDER BY hh.captured_at DESC
      LIMIT 1
    ) h ON TRUE
    WHERE u.roblox_id IS NOT NULL
  ) a ON TRUE
  LEFT JOIN LATERAL (
    SELECT hh.username AS top_username, hh.points AS top_points
    FROM users u
    JOIN LATERAL (
      SELECT hh2.username, hh2.points
      FROM player_leaderboard_history hh2
      WHERE hh2.battle_id = lower(rb.battle_id)
        AND hh2.roblox_id = TRIM(u.roblox_id)
        AND hh2.captured_at <= rb.end_time + INTERVAL '12 hours'
      ORDER BY hh2.captured_at DESC
      LIMIT 1
    ) hh ON TRUE
    WHERE u.roblox_id IS NOT NULL
    ORDER BY hh.points DESC NULLS LAST
    LIMIT 1
  ) t ON TRUE
  ORDER BY rb.end_time DESC`

const prettyWarTitle = (battleId: string, battleName: unknown): string => {
  const raw = typeof battleName === "string" && battleName.trim() ? battleName.trim() : battleId
  return raw.replace(/battle\s*\d*/gi, "").trim() || raw
}

async function historyEntries(limit = 8): Promise<WarHistoryEntry[]> {
  try {
    const result = await pool.query(HISTORY_SQL, [limit])
    return (result.rows as Json[]).map((row) => ({
      battleId: String(row.battle_id ?? ""),
      title: prettyWarTitle(String(row.battle_id ?? ""), row.battle_name),
      endedAt: row.end_time ? new Date(String(row.end_time)).toISOString() : null,
      scorers: asNumber(row.scorers) ?? 0,
      clanPoints: asNumber(row.clan_points) ?? 0,
      topUsername: row.top_username ? String(row.top_username) : null,
      topPoints: asNumber(row.top_points),
    }))
  } catch {
    return []
  }
}

export async function loadAskerWars(robloxId: string | null, limit = 8): Promise<AskerWar[]> {
  if (!robloxId) return []
  try {
    const result = await pool.query(
      `WITH recent AS (
         SELECT battle_id, battle_name, end_time
         FROM battles
         WHERE end_time IS NOT NULL AND end_time <= NOW()
         ORDER BY end_time DESC
         LIMIT $2
       ),
       mine AS (
         SELECT DISTINCT ON (rb.battle_id)
           rb.battle_id, rb.battle_name, rb.end_time, h.points
         FROM player_leaderboard_history h
         JOIN recent rb
           ON h.battle_id = lower(rb.battle_id)
         WHERE h.roblox_id::text = $1
           AND h.points IS NOT NULL
           AND h.captured_at <= rb.end_time + INTERVAL '12 hours'
         ORDER BY rb.battle_id, h.captured_at DESC
       )
       SELECT battle_id, battle_name, end_time, points FROM mine ORDER BY end_time DESC`,
      [robloxId, limit]
    )
    return (result.rows as Json[]).map((row) => ({
      title: prettyWarTitle(String(row.battle_id ?? ""), row.battle_name),
      points: asNumber(row.points) ?? 0,
      endedAt: row.end_time ? new Date(String(row.end_time)).toISOString() : null,
    }))
  } catch {
    return []
  }
}

export async function getSharedWarContext(force = false): Promise<SharedWarContext> {
  if (!force && sharedCache && Date.now() - sharedCache.at < SHARED_CACHE_MS) {
    return sharedCache.context
  }

  const [battlePayload, clanPayload, standingsPayload] = await Promise.all([
    fetchJson(ACTIVE_BATTLE_API),
    fetchJson(CLAN_API),
    fetchJson(CLANS_LEADERBOARD_API),
  ])
  const historyPromise = historyEntries()

  const configData = ((battlePayload?.data as Json | undefined)?.configData ?? null) as Json | null
  const battleId = typeof configData?.Title === "string" ? configData.Title : null
  const startSec = toEpochSeconds(configData?.StartTime)
  const finishSec = toEpochSeconds(configData?.FinishTime)
  const nowSec = Math.floor(Date.now() / 1000)
  const active = Boolean(finishSec && nowSec < finishSec && startSec && nowSec >= startSec)
  const timeLeftMs = active && finishSec ? (finishSec - nowSec) * 1000 : null

  const clanData = (clanPayload?.data ?? {}) as Json
  const members = Array.isArray(clanData.Members) ? clanData.Members.length : null
  const battles = (clanData.Battles ?? {}) as Json
  const battleEntry = battleId ? ((battles[battleId] ?? null) as Json | null) : null
  const apiPoints = asNumber(battleEntry?.Points)
  const contributions = Array.isArray(battleEntry?.PointContributions)
    ? (battleEntry.PointContributions as unknown[]).length
    : null

  const standings: StandingRow[] = []
  if (Array.isArray(standingsPayload?.data)) {
    for (const row of standingsPayload.data as Json[]) {
      const name = String(row.Name ?? row.name ?? "")
      const points = asNumber(row.Points ?? row.points) ?? 0
      if (name) standings.push({ rank: standings.length + 1, name, points, pph: null })
    }
  }

  const battleKey = battleId ? normalizeBattleKey(battleId) : ""
  const [latest, hourAgo, dayAgo, memberRows, clanPphMap] = battleKey
    ? await Promise.all([
        latestSnapshot(battleKey),
        snapshotNear(battleKey, nowSec - 3600),
        snapshotNear(battleKey, nowSec - 86400),
        memberLines(battleKey),
        getClanPphMap(battleId),
      ])
    : [null, null, null, [], new Map<string, number>()]

  // Attach each rival clan's live PPH (from clan_history) to its standing row,
  // so the assistant can reason about rival pace, not just static point gaps.
  if (clanPphMap.size > 0) {
    for (const row of standings) {
      const pph = clanPphMap.get(normalizeClanName(row.name))
      if (pph !== undefined) row.pph = pph
    }
  }

  const snapshotPoints = latest ? asNumber(latest.battle_points) : null
  const snapshotRank = latest ? asNumber(latest.rank) : null
  const clanPoints = apiPoints ?? snapshotPoints

  let clanRank = snapshotRank
  const usIndex = standings.findIndex((row) => row.name.toUpperCase() === CLAN_NAME.toUpperCase())
  if (active && usIndex >= 0) clanRank = usIndex + 1

  const gainLastHour =
    snapshotPoints !== null && hourAgo && asNumber(hourAgo.battle_points) !== null
      ? snapshotPoints - Number(hourAgo.battle_points)
      : null
  const gainLast24h =
    snapshotPoints !== null && dayAgo && asNumber(dayAgo.battle_points) !== null
      ? snapshotPoints - Number(dayAgo.battle_points)
      : null

  const hourlyRate =
    gainLastHour !== null
      ? gainLastHour
      : gainLast24h !== null
      ? Math.round(gainLast24h / 24)
      : null

  const hoursLeft = timeLeftMs !== null ? timeLeftMs / 3_600_000 : null
  const projectedFinalPoints =
    active && clanPoints !== null && hourlyRate !== null && hoursLeft !== null
      ? Math.max(clanPoints, Math.round(clanPoints + hourlyRate * hoursLeft))
      : null
  const projectedRankIfPaceHolds =
    active && projectedFinalPoints !== null && standings.length
      ? 1 + standings.filter((row) => row.points > projectedFinalPoints).length
      : null

  const topScorers = memberRows.filter((row) => row.points > 0).slice(0, 10)
  const movers = memberRows
    .filter((row) => row.gain24h !== null && row.gain24h > 0)
    .sort((a, b) => (b.gain24h ?? 0) - (a.gain24h ?? 0))
    .slice(0, 10)
  const zeroRows = memberRows.filter((row) => row.points <= 0)
  // Hub-parity semantics: count scorers (points > 0) seen in the final 24h of
  // our data for this battle. All-time history over-counts players kicked
  // mid-war whose contributions the game later erased.
  const maxCaptured = memberRows.reduce((max, row) => Math.max(max, row.capturedAt ?? 0), 0)
  const historyScorers = maxCaptured
    ? memberRows.filter(
        (row) =>
          row.points > 0 && row.capturedAt !== null && maxCaptured - row.capturedAt <= 24 * 3600 * 1000
      ).length
    : memberRows.filter((row) => row.points > 0).length
  const contributors = Math.max(contributions ?? 0, historyScorers) || null

  const context: SharedWarContext = {
    generatedAt: new Date().toISOString(),
    active,
    battleId,
    timeLeftMs,
    endsAt: finishSec ? new Date(finishSec * 1000).toISOString() : null,
    clanRank,
    clanPoints,
    memberCount: members,
    sampleClans: standings.length,
    gainLastHour,
    gainLast24h,
    hourlyRate,
    projectedFinalPoints,
    projectedRankIfPaceHolds,
    standings,
    rewards: parseRewardTiers(configData),
    topScorers,
    movers,
    members: memberRows,
    zeroCount: zeroRows.length,
    zeroNames: zeroRows.slice(0, 8).map((row) => row.username),
    contributors,
    history: await historyPromise,
  }

  sharedCache = { at: Date.now(), context }
  return context
}

export function buildAskerContext(
  user: { username: string; robloxId: string | null },
  shared: SharedWarContext,
  wars: AskerWar[] = []
): AskerContext {
  const base: AskerContext = {
    username: user.username,
    robloxId: user.robloxId,
    points: null,
    rank: null,
    gapToNext: null,
    nextPlayer: null,
    gain24h: null,
    inRoster: false,
    wars,
  }

  if (!shared.members.length) return base

  const byRoblox = user.robloxId
    ? shared.members.find((row) => row.robloxId === String(user.robloxId))
    : undefined
  const lower = user.username.toLowerCase()
  const byName = byRoblox ?? shared.members.find((row) => row.username.toLowerCase() === lower)
  if (!byName) return base

  const scored = shared.members.filter((row) => row.points > 0)
  const index = scored.findIndex((row) => row.robloxId === byName.robloxId)
  const above = index > 0 ? scored[index - 1] : null

  return {
    ...base,
    points: byName.points,
    rank: byName.points > 0 && index >= 0 ? index + 1 : byName.rank,
    gapToNext: above ? above.points - byName.points : null,
    nextPlayer: above ? above.username : null,
    gain24h: byName.gain24h,
    inRoster: true,
  }
}


