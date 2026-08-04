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
export type StandingRow = { rank: number; name: string; points: number }
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
         AND regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $2
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
         AND regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $2
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
      `SELECT DISTINCT ON (roblox_id)
         roblox_id, username, points, rank, captured_at
       FROM player_leaderboard_history
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
       ORDER BY roblox_id, captured_at DESC`,
      [battleKey]
    )

    const dayAgo = await pool.query(
      `SELECT DISTINCT ON (roblox_id)
         roblox_id, points
       FROM player_leaderboard_history
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
         AND captured_at <= NOW() - INTERVAL '24 hours'
       ORDER BY roblox_id, captured_at DESC`,
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

export async function getSharedWarContext(force = false): Promise<SharedWarContext> {
  if (!force && sharedCache && Date.now() - sharedCache.at < SHARED_CACHE_MS) {
    return sharedCache.context
  }

  const [battlePayload, clanPayload, standingsPayload] = await Promise.all([
    fetchJson(ACTIVE_BATTLE_API),
    fetchJson(CLAN_API),
    fetchJson(CLANS_LEADERBOARD_API),
  ])

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
      if (name) standings.push({ rank: standings.length + 1, name, points })
    }
  }

  const battleKey = battleId ? normalizeBattleKey(battleId) : ""
  const [latest, hourAgo, dayAgo, memberRows] = battleKey
    ? await Promise.all([
        latestSnapshot(battleKey),
        snapshotNear(battleKey, nowSec - 3600),
        snapshotNear(battleKey, nowSec - 86400),
        memberLines(battleKey),
      ])
    : [null, null, null, []]

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
  }

  sharedCache = { at: Date.now(), context }
  return context
}

export function buildAskerContext(
  user: { username: string; robloxId: string | null },
  shared: SharedWarContext
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

// ---------------------------------------------------------------------------
// Compact serialization for the LLM prompt (kept small on purpose).
// ---------------------------------------------------------------------------

export function packForPrompt(shared: SharedWarContext, asker: AskerContext, officer: boolean) {
  const minutesLeft = shared.timeLeftMs === null ? null : Math.round(shared.timeLeftMs / 60000)

  const usIndex = shared.standings.findIndex(
    (row) => row.name.toUpperCase() === CLAN_NAME.toUpperCase()
  )
  const aroundUs =
    usIndex >= 0
      ? shared.standings.slice(Math.max(0, usIndex - 2), usIndex + 3)
      : []

  return {
    war: {
      battle: shared.battleId,
      active: shared.active,
      minutesLeft,
      clanRank: shared.clanRank,
      clanPoints: shared.clanPoints,
      gainLastHour: shared.gainLastHour,
      gainLast24h: shared.gainLast24h,
      projectedFinalPoints: shared.projectedFinalPoints,
      projectedRankIfPaceHolds: shared.projectedRankIfPaceHolds,
      contributors: shared.contributors,
      memberCount: shared.memberCount,
    },
    rewardsByPlacement: shared.rewards,
    standingsTop10: shared.standings.slice(0, 10),
    standingsAroundUs: aroundUs,
    topScorers: shared.topScorers.slice(0, 8).map((row) => ({
      username: row.username,
      points: row.points,
      gain24h: row.gain24h,
    })),
    biggestMovers24h: shared.movers.slice(0, 5).map((row) => ({
      username: row.username,
      gain24h: row.gain24h,
    })),
    asker,
    ...(officer
      ? { officersOnly: { zeroPointCount: shared.zeroCount, zeroPointNames: shared.zeroNames } }
      : { zeroPointCount: shared.zeroCount }),
  }
}
