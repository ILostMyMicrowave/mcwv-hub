import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

type PlayerRow = Record<string, unknown>

type BotPlayersResponse = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function firstArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []

  for (const key of keys) {
    const candidate = value[key]
    if (Array.isArray(candidate)) return candidate
  }

  if (isRecord(value.data)) {
    for (const key of keys) {
      const candidate = value.data[key]
      if (Array.isArray(candidate)) return candidate
    }
  }

  return []
}

function pickValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && value !== "") return value
  }
  return null
}

function toStringOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return String(value)
}

function toStringOrFallback(value: unknown, fallback = "—") {
  return toStringOrNull(value) ?? fallback
}

function toNumberOrZero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizePresence(value: unknown) {
  if (typeof value === "number") {
    if (value === 0) return "Offline"
    if (value === 1) return "Online"
    if (value === 2) return "In Game"
    if (value === 3) return "In Studio"
  }

  if (typeof value === "string" && value.trim()) return value
  return "Unknown"
}

function normalizePlayer(value: unknown) {
  if (Array.isArray(value)) {
    const robloxId = value[0]
    const discord = value[1]
    const username = value[2]

    return {
      id: toStringOrNull(robloxId) ?? toStringOrFallback(username, "Unknown"),
      robloxId: toStringOrNull(robloxId),
      roblox_id: toStringOrNull(robloxId),
      discord: toStringOrNull(discord),
      discord_id: toStringOrNull(discord),
      username: toStringOrFallback(username, toStringOrFallback(robloxId, "Unknown")),
      status: "Unknown",
      currentWorld: "—",
      current_world: "—",
      lastSeen: null,
      last_seen: null,
      clanRank: "—",
      clan_rank: "—",
      points: 0,
      avatar: null,
    }
  }

  if (!isRecord(value)) return null

  const robloxId = pickValue(value, [
    "robloxId",
    "roblox_id",
    "robloxID",
    "RobloxID",
    "UserID",
    "userId",
    "user_id",
    "targetId",
    "id",
  ])
  const username = pickValue(value, [
    "username",
    "name",
    "Name",
    "robloxUsername",
    "roblox_username",
    "robloxName",
    "roblox_name",
    "displayName",
    "DisplayName",
    "player",
    "user",
  ])
  const discord = pickValue(value, [
    "discord",
    "discord_id",
    "discordId",
    "DiscordID",
    "discordUser",
    "discord_user",
    "memberId",
    "member_id",
  ])
  const presence = pickValue(value, [
    "status",
    "presence",
    "presenceStatus",
    "presence_status",
    "userPresenceType",
    "presence_type",
    "robloxStatus",
  ])
  const currentWorld = pickValue(value, ["currentWorld", "current_world", "world", "place", "location", "game"])
  const lastSeen = pickValue(value, ["lastSeen", "last_seen", "lastOnline", "last_online", "updatedAt", "updated_at"])
  const clanRank = pickValue(value, ["clanRank", "clan_rank", "clanRole", "clan_role", "rank"])
  const points = pickValue(value, ["points", "Points", "battlePoints", "battle_points", "totalPoints", "total_points"])
  const avatar = pickValue(value, ["avatar", "avatarUrl", "avatar_url", "imageUrl", "image_url", "thumbnail", "thumbnailUrl"])

  return {
    ...value,
    id: toStringOrNull(pickValue(value, ["id"])) ?? toStringOrNull(robloxId) ?? toStringOrFallback(username, "Unknown"),
    robloxId: toStringOrNull(robloxId),
    roblox_id: toStringOrNull(robloxId),
    username: toStringOrFallback(username, toStringOrFallback(robloxId, "Unknown")),
    discord: toStringOrNull(discord),
    discord_id: toStringOrNull(discord),
    status: normalizePresence(presence),
    currentWorld: toStringOrFallback(currentWorld, "—"),
    current_world: toStringOrFallback(currentWorld, "—"),
    lastSeen: toStringOrNull(lastSeen),
    last_seen: toStringOrNull(lastSeen),
    clanRank: toStringOrFallback(clanRank, "—"),
    clan_rank: toStringOrFallback(clanRank, "—"),
    points: toNumberOrZero(points),
    avatar: toStringOrNull(avatar),
  }
}

function normalizeLink(value: unknown) {
  if (Array.isArray(value)) {
    return {
      discord_id: toStringOrNull(value[0]),
      roblox_id: toStringOrNull(value[1]),
      username: toStringOrNull(value[2]),
    }
  }

  if (!isRecord(value)) return null

  const discord = pickValue(value, ["discord", "discord_id", "discordId", "DiscordID"])
  const robloxId = pickValue(value, ["robloxId", "roblox_id", "robloxID", "RobloxID", "UserID", "user_id"])
  const username = pickValue(value, ["username", "name", "robloxUsername", "roblox_username", "robloxName", "roblox_name"])

  return {
    ...value,
    discord_id: toStringOrNull(discord),
    roblox_id: toStringOrNull(robloxId),
    username: toStringOrNull(username),
  }
}

async function getColumns(tableName: string) {
  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [tableName]
  )

  return new Set(result.rows.map((row) => row.column_name))
}

function pickSelect(columns: Set<string>) {
  const expressions: string[] = []

  if (columns.has("id")) expressions.push("id::text AS id")
  else if (columns.has("roblox_id")) expressions.push("roblox_id::text AS id")
  else expressions.push("username::text AS id")

  if (columns.has("username")) expressions.push("username::text AS username")
  else expressions.push("''::text AS username")

  if (columns.has("discord_id")) expressions.push("discord_id::text AS discord_id")
  else expressions.push("NULL::text AS discord_id")

  if (columns.has("roblox_id")) expressions.push("roblox_id::text AS roblox_id")
  else expressions.push("NULL::text AS roblox_id")

  if (columns.has("role")) expressions.push("role::text AS role")
  else expressions.push("NULL::text AS role")

  if (columns.has("last_seen")) expressions.push("last_seen::text AS last_seen")
  else expressions.push("NULL::text AS last_seen")

  if (columns.has("points")) expressions.push("points::bigint AS points")
  else expressions.push("0::bigint AS points")

  return expressions.join(", ")
}

async function getHubPlayers() {
  const columns = await getColumns("users")
  if (!columns.size) return []

  const select = pickSelect(columns)
  const where = columns.has("roblox_id")
    ? "WHERE roblox_id IS NOT NULL AND TRIM(CAST(roblox_id AS TEXT)) <> ''"
    : ""
  const result = await pool.query<PlayerRow>(
    `SELECT ${select}
     FROM users
     ${where}
     ORDER BY username ASC
     LIMIT 500`
  )

  return result.rows.map((row) => ({
    id: String(row.id ?? row.roblox_id ?? row.username),
    avatar: null,
    username: String(row.username ?? "Unknown"),
    discord: row.discord_id ? String(row.discord_id) : null,
    robloxId: row.roblox_id ? String(row.roblox_id) : null,
    status: "Unknown",
    currentWorld: "—",
    lastSeen: row.last_seen ? String(row.last_seen) : null,
    clanRank: row.role ? String(row.role) : "—",
    points: Number(row.points ?? 0),
  }))
}

async function getHubLinks() {
  const altColumns = await getColumns("user_alts").catch(() => new Set<string>())
  if (!altColumns.size) return []

  const result = await pool.query(
    `SELECT discord_id::text AS discord_id,
            roblox_id::text AS roblox_id,
            username::text AS username
     FROM user_alts
     ORDER BY discord_id ASC, username ASC
     LIMIT 1000`
  )

  return result.rows
}

export async function GET() {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  if (botAdminApiConfigured()) {
    try {
      const data = await botAdminFetch<BotPlayersResponse>("/admin/players")
      const botPlayers = firstArray(data, ["players", "trackedPlayers", "users", "entries", "data"])
        .map(normalizePlayer)
        .filter((player): player is NonNullable<ReturnType<typeof normalizePlayer>> => player !== null)
      const botLinks = firstArray(data, ["links", "robloxLinks", "alts", "user_alts"])
        .map(normalizeLink)
        .filter((link): link is NonNullable<ReturnType<typeof normalizeLink>> => link !== null)

      if (botPlayers.length > 0) {
        return NextResponse.json({
          ...data,
          players: botPlayers,
          links: botLinks,
        })
      }

      console.warn("[api/admin/players] bot returned no players; falling back to Hub DB")
    } catch (err) {
      if (!(err instanceof BotAdminApiError)) {
        console.error("[api/admin/players] bot proxy error:", err)
      }
      // Fall back to Hub DB below so the panel still remains useful.
    }
  }

  try {
    const [players, links] = await Promise.all([getHubPlayers(), getHubLinks()])
    return NextResponse.json({
      success: true,
      source: "hub-db",
      players,
      links,
    })
  } catch (err) {
    console.error("[api/admin/players] error:", err)
    return NextResponse.json(
      { error: "Failed to load players" },
      { status: 500 }
    )
  }
}
