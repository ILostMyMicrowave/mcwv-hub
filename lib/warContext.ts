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
  headlineReward: string | null /* the marquee reward (Titanic etc.) */
  contributorRewards: RewardTier[] /* what members win by contributor rank */
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
      // 6s keeps the assistant route comfortably under Vercel's function
      // timeout even with retries; a slower API just means "less data".
      signal: AbortSignal.timeout(6000),
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

// Per-clan PPH from clan_history (populated every minute by the war collector).
// Returns a map keyed by normalized clan name -> points gained in the last 60min.
// Falls back to the latest stored battle if the live battleId doesn't match a
// stored row yet (e.g. a war that just started). Fails soft: empty map on any
// error / missing table, so the assistant just says less.
async function getClanPphMap(battleId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!battleId) return map
  try {
    // Aggregate in SQL: one row per clan — latest snapshot minus the last
    // snapshot captured ≥60 min earlier. This used to stream EVERY
    // clan_history row of the battle's 3-hour window to the client (~1MB per
    // refresh × ~960 refreshes/day per isolate): the main driver of the
    // 5.4GB/mo Supabase egress that pushed the org past the free 5GB quota.
    // Semantics preserved: a clan whose history doesn't reach 60 min back is
    // skipped (young wars report no PPH), values >10B are treated as
    // k-scaled (same heuristic as asNumber), and only a positive PPH is
    // kept. The old code interpolated the baseline between snapshots; with
    // the collector's 1-minute cadence the difference is at most one
    // minute's points — irrelevant for "rival pace" reasoning.
    let result = await pool.query<{ clan_name: string; pph: number | string }>(
      `WITH win AS (
           SELECT clan_name, points, captured_at
           FROM clan_history
           WHERE battle_id = $1
             AND captured_at >= NOW() - INTERVAL '3 hours'
         ),
         lat AS (
           SELECT DISTINCT ON (clan_name)
                  clan_name, points AS latest_points, captured_at AS latest_at
           FROM win
           ORDER BY clan_name, captured_at DESC
         ),
         bas AS (
           SELECT DISTINCT ON (w.clan_name)
                  w.clan_name, w.points AS base_points
           FROM win w
           JOIN lat l ON l.clan_name = w.clan_name
           WHERE w.captured_at <= l.latest_at - INTERVAL '60 minutes'
           ORDER BY w.clan_name, w.captured_at DESC
         )
         SELECT lat.clan_name,
                (CASE WHEN lat.latest_points > 10000000000 THEN lat.latest_points / 1000 ELSE lat.latest_points END)
              - (CASE WHEN bas.base_points  > 10000000000 THEN bas.base_points  / 1000 ELSE bas.base_points  END) AS pph
         FROM lat
         JOIN bas ON bas.clan_name = lat.clan_name`,
      [battleId]
    )

    // Live battleId may not match a stored row yet (fresh war, or id text
    // differs). Use the most recent stored battle as a fallback so rival pace
    // is still available.
    if (!result.rows.length) {
      result = await pool.query<{ clan_name: string; pph: number | string }>(
        `WITH b AS (
             SELECT battle_id
             FROM battles
             ORDER BY COALESCE(end_time, start_time, created_at, NOW()) DESC
             LIMIT 1
           ),
           win AS (
             SELECT ch.clan_name, ch.points, ch.captured_at
             FROM clan_history ch, b
             WHERE ch.battle_id = b.battle_id
               AND ch.captured_at >= NOW() - INTERVAL '3 hours'
           ),
           lat AS (
             SELECT DISTINCT ON (clan_name)
                    clan_name, points AS latest_points, captured_at AS latest_at
             FROM win
             ORDER BY clan_name, captured_at DESC
           ),
           bas AS (
             SELECT DISTINCT ON (w.clan_name)
                    w.clan_name, w.points AS base_points
             FROM win w
             JOIN lat l ON l.clan_name = w.clan_name
             WHERE w.captured_at <= l.latest_at - INTERVAL '60 minutes'
             ORDER BY w.clan_name, w.captured_at DESC
           )
           SELECT lat.clan_name,
                  (CASE WHEN lat.latest_points > 10000000000 THEN lat.latest_points / 1000 ELSE lat.latest_points END)
                - (CASE WHEN bas.base_points  > 10000000000 THEN bas.base_points  / 1000 ELSE bas.base_points  END) AS pph
           FROM lat
           JOIN bas ON bas.clan_name = lat.clan_name`
      )
    }

    for (const row of result.rows) {
      const key = normalizeClanName(row.clan_name)
      if (!key) continue
      const raw = asNumber(row.pph)
      if (raw === null) continue
      const pph = Math.max(0, Math.round(raw))
      if (pph > 0) map.set(key, pph)
    }
  } catch (err) {
    console.warn("[warContext] clan pph map unavailable:", err)
  }
  return map
}

function rewardItemLabel(item: Json | null): string | null {
  if (!item) return null
  // v1 API returns plain items {id, variant, particleTier}; the legacy
  // configData wraps them as {_data: {id, pt}}.
  const data = (item._data ?? item) as Json
  const id = typeof data.id === "string" && data.id ? data.id : null
  if (!id) return null
  const variant = typeof data.variant === "string" ? data.variant.toLowerCase() : ""
  const pt = asNumber(data.pt ?? data.particleTier)
  if (variant === "shinyrainbow" || pt === 2) return `Rainbow ${id}`
  if (variant === "shinygold" || pt === 1) return `Golden ${id}`
  return id
}

function itemsLabel(items: Json | null): string | null {
  if (!Array.isArray(items)) return null
  const labels = (items as Json[])
    .map((i) => rewardItemLabel(i as Json))
    .filter((l): l is string => Boolean(l))
  return labels.length ? labels.join(" + ") : null
}

type ParsedWarRewards = {
  tiers: RewardTier[] // clan-placement tiers (what the CLAN wins)
  contributor: RewardTier[] // contributor bands (what members win by rank)
  headline: string | null // the marquee Titanic/etc. reward
}

function dedupeContributorBands(bands: RewardTier[]): RewardTier[] {
  // Bands like 1–30 "Ninja" and 1–50 "Ninja" overlap — keep the tightest band
  // per distinct label so the summary reads clean.
  const sorted = [...bands].sort((a, b) => a.worst - b.worst)
  const seen = new Set<string>()
  const out: RewardTier[] = []
  for (const band of sorted) {
    if (seen.has(band.label)) continue
    seen.add(band.label)
    out.push(band)
  }
  return out
}

function parseV1Rewards(meta: Json | null): ParsedWarRewards {
  const tiers: RewardTier[] = []
  const contributor: RewardTier[] = []
  const headline = rewardItemLabel((meta?.headlineReward ?? null) as Json | null)
  const raw = meta?.placementRewards
  if (Array.isArray(raw)) {
    for (const entry of raw as Json[]) {
      const best = asNumber(entry.best ?? entry.Best)
      const worst = asNumber(entry.worst ?? entry.Worst)
      if (best === null || worst === null) continue
      const label = itemsLabel((entry.items ?? null) as Json | null) ?? rewardItemLabel((entry.Item ?? null) as Json | null)
      if (!label) continue
      const placement = String(entry.placement ?? "")
      const isTopTier = placement === "1st" || typeof entry.contributorPlacement === "string"
      // Contributor bands all start at rank 1 and are not the top tier entry.
      if (best === 1 && worst > 1 && !isTopTier) {
        contributor.push({ best, worst, label })
      } else {
        tiers.push({ best, worst, label })
      }
    }
  }
  tiers.sort((a, b) => a.best - b.best || a.worst - b.worst)
  return { tiers, contributor: dedupeContributorBands(contributor), headline }
}

function parseLegacyRewards(configData: Json | null): ParsedWarRewards {
  const raw = configData?.PlacementRewards
  const tiers: RewardTier[] = []
  const contributor: RewardTier[] = []
  if (Array.isArray(raw)) {
    for (const entry of raw as Json[]) {
      const best = asNumber(entry.Best)
      const worst = asNumber(entry.Worst)
      if (best === null || worst === null) continue
      const label = rewardItemLabel((entry.Item ?? null) as Json | null)
      if (!label) continue
      const hasContribField = asNumber(entry.BestContributor) !== null
      if (best === 1 && worst > 1 && !hasContribField) {
        contributor.push({ best, worst, label })
      } else {
        tiers.push({ best, worst, label })
      }
    }
  }
  tiers.sort((a, b) => a.best - b.best || a.worst - b.worst)
  return { tiers, contributor: dedupeContributorBands(contributor), headline: null }
}

function parseBattleRewards(v1Meta: Json | null, configData: Json | null): ParsedWarRewards {
  const v1 = parseV1Rewards(v1Meta)
  if (v1.tiers.length || v1.contributor.length || v1.headline) return v1
  return parseLegacyRewards(configData)
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

let sharedCache: { at: number; context: SharedWarContext; degraded: boolean } | null = null

// A context built while the live API was unreachable is cached much shorter,
// so a transient outage does not pin a stale "no war" / empty state for the
// full 90s success TTL.
const SHARED_CACHE_DEGRADED_MS = 10_000
function sharedCacheTtl(degraded: boolean) {
  return degraded ? SHARED_CACHE_DEGRADED_MS : SHARED_CACHE_MS
}

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

// ---------------------------------------------------------------------------
// Local "is a war live?" evidence, used ONLY when the live battle API is
// unreachable. An API hiccup must never flip the hub to "no war" mid-battle:
// the war collector and the hub's own detection writes keep writing to these
// tables throughout the war. Every signal fails soft (missing table = null).
// ---------------------------------------------------------------------------
async function detectActiveWarFromDb(): Promise<{
  battleId: string
  endMs: number | null
} | null> {
  const endMsOf = (value: Date | string | null | undefined): number | null => {
    if (value === null || value === undefined) return null
    const ms = new Date(String(value)).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  const inFuture = (ms: number | null): boolean => ms !== null && ms > Date.now()

  // 1) Which battle is live? Signals in priority order:
  //    - clan_history: the war collector writes a row every minute while a war
  //      runs; a row captured within the last 10 minutes = war in progress.
  //    - war_detection_windows: the hub itself recorded this battle recently
  //      with an end time still in the future.
  //    - battles: a recorded battle whose end time is null/future has not
  //      finished, regardless of row age.
  //    Every signal fails soft (missing table = skipped).
  let battleId: string | null = null

  try {
    const res = await pool.query<{ battle_id: string }>(
      `SELECT battle_id
       FROM clan_history
       WHERE captured_at >= NOW() - INTERVAL '10 minutes'
       ORDER BY captured_at DESC
       LIMIT 1`
    )
    if (res.rows[0]) battleId = String(res.rows[0].battle_id)
  } catch {
    // table missing — next signal
  }

  if (!battleId) {
    try {
      const res = await pool.query<{ battle_id: string }>(
        `SELECT battle_id
         FROM war_detection_windows
         WHERE api_end_at > NOW()
           AND updated_at >= NOW() - INTERVAL '15 minutes'
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      if (res.rows[0]) battleId = String(res.rows[0].battle_id)
    } catch {
      // table missing — next signal
    }
  }

  if (!battleId) {
    try {
      const res = await pool.query<{ battle_id: string }>(
        `SELECT battle_id
         FROM battles
         WHERE (end_time IS NULL OR end_time > NOW())
           AND (start_time IS NULL OR start_time <= NOW())
         ORDER BY COALESCE(start_time, created_at) DESC NULLS LAST
         LIMIT 1`
      )
      if (res.rows[0]) battleId = String(res.rows[0].battle_id)
    } catch {
      // table missing — give up
    }
  }

  if (!battleId) return null

  // 2) Best end-time for THAT battle (detection window first, then battles).
  let endMs: number | null = null
  try {
    const res = await pool.query<{ api_end_at: Date | string }>(
      `SELECT api_end_at
       FROM war_detection_windows
       WHERE battle_id = $1 AND api_end_at > NOW()
       LIMIT 1`,
      [battleId]
    )
    endMs = endMsOf(res.rows[0]?.api_end_at)
    if (!inFuture(endMs)) endMs = null
  } catch {
    // table missing — next source
  }

  if (endMs === null) {
    try {
      const res = await pool.query<{ end_time: Date | string | null }>(
        `SELECT end_time
         FROM battles
         WHERE battle_id = $1 AND end_time > NOW()
         LIMIT 1`,
        [battleId]
      )
      endMs = endMsOf(res.rows[0]?.end_time)
      if (!inFuture(endMs)) endMs = null
    } catch {
      // table missing — end time stays unknown
    }
  }

  return { battleId, endMs }
}

async function refreshSharedWarContext(): Promise<SharedWarContext> {
  const [battlePayload, clanPayload, standingsPayload] = await Promise.all([
    fetchJson(ACTIVE_BATTLE_API),
    fetchJson(CLAN_API),
    fetchJson(CLANS_LEADERBOARD_API),
  ])
  const historyPromise = historyEntries()

  const configData = ((battlePayload?.data as Json | undefined)?.configData ?? null) as Json | null
  let battleId = typeof configData?.Title === "string" ? configData.Title : null
  let startSec = toEpochSeconds(configData?.StartTime)
  let finishSec = toEpochSeconds(configData?.FinishTime)
  const nowSec = Math.floor(Date.now() / 1000)

  // The live battle API is the source of truth — but when it is unreachable we
  // must NOT declare "no war" if the hub's own collector data says a battle is
  // in progress (a short API hiccup used to pin a 90s "no war" cache mid-war).
  let localWar: { battleId: string; endMs: number | null } | null = null
  if (!battlePayload) {
    localWar = await detectActiveWarFromDb()
    if (localWar) {
      battleId = localWar.battleId
      if (localWar.endMs !== null) finishSec = Math.floor(localWar.endMs / 1000)
      startSec = startSec ?? nowSec // battle is live; start time unknown
    }
  }

  const apiActive = Boolean(finishSec && nowSec < finishSec && startSec && nowSec >= startSec)
  const active = apiActive || localWar !== null
  const timeLeftMs = active && finishSec ? (finishSec - nowSec) * 1000 : null

  // The v1 battle endpoint carries the full reward table (headline reward,
  // placement tiers, contributor bands). Parse it when we know the battle id;
  // fall back to the legacy configData format otherwise.
  // Only when the live API actually answered — a battleId recovered from the
  // DB fallback would just burn an 8s timeout on an unreachable host.
  const v1Meta =
    battleId && battlePayload
      ? (((await fetchJson(`${PS99_API}/v1/clans/battles/${encodeURIComponent(battleId)}`))?.data as Json | undefined)?.meta ?? null) as Json | null
      : null
  const parsedRewards = parseBattleRewards(v1Meta, configData)

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
    rewards: parsedRewards.tiers,
    headlineReward: parsedRewards.headline,
    contributorRewards: parsedRewards.contributor,
    topScorers,
    movers,
    members: memberRows,
    zeroCount: zeroRows.length,
    zeroNames: zeroRows.slice(0, 8).map((row) => row.username),
    contributors,
    history: await historyPromise,
  }

  // degraded = the live active-battle API was unreachable, so `active` /
  // timings lean on DB fallback data (up to ~10min stale) — cache it briefly.
  sharedCache = { at: Date.now(), context, degraded: !battlePayload }
  return context
}

// Stale-while-revalidate plumbing (2026-09-13): during Vercel egress bad
// patches a cache refresh can take 30-60s (DB connect retries). Status
// polls (app-status, war pages, assistant) must never wait for that —
// serve the cached context immediately and refresh in the background.
// One refresh runs at a time per isolate; concurrent stale callers reuse
// it (previously every stale poll ran its OWN full retry chain in
// parallel — up to 15 connection attempts at once). The WAR STARTED push
// fires from the first response built after the refresh lands, so it lags
// the old blocking behaviour by at most one poll cycle (~30s).
let sharedRefreshInFlight = false

function kickBackgroundRefresh() {
  if (sharedRefreshInFlight) return
  sharedRefreshInFlight = true
  void refreshSharedWarContext()
    .catch((err) => {
      console.warn(
        "[warContext] background refresh failed:",
        err instanceof Error ? err.message : err
      )
    })
    .finally(() => {
      sharedRefreshInFlight = false
    })
}

export async function getSharedWarContext(force = false): Promise<SharedWarContext> {
  const cache = sharedCache
  if (!force && cache) {
    if (Date.now() - cache.at < sharedCacheTtl(cache.degraded)) {
      return cache.context
    }
    // Stale but present: serve it now, refresh quietly in the background.
    kickBackgroundRefresh()
    return cache.context
  }
  // Cold isolate (no cache yet) or an explicit force: block as before.
  return refreshSharedWarContext()
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


