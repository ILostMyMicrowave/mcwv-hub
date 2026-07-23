import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { pool } from "@/lib/db"
import { BotAdminApiError, botAdminFetch, botAdminApiConfigured } from "@/lib/botAdminApi"

export const dynamic = "force-dynamic"
export const revalidate = 0

type BotStatus = {
  ok?: boolean
  bot?: Record<string, unknown>
  overview?: Record<string, unknown>
  loops?: Record<string, unknown>
  giveaways?: unknown
  invites?: unknown
  war?: unknown
  logs?: unknown[]
}

async function databaseHealth() {
  const started = Date.now()
  await pool.query("SELECT 1")
  return {
    status: "Connected",
    latencyMs: Date.now() - started,
  }
}

async function countTrackedPlayers() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE roblox_id IS NOT NULL
         AND TRIM(CAST(roblox_id AS TEXT)) <> ''`
    )

    return Number(result.rows[0]?.count ?? 0)
  } catch {
    return 0
  }
}

function normalizeCurrentWar(value: unknown) {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed.toLowerCase()
  const clanName = (process.env.WAR_ASSISTANT_CLAN_NAME ?? "MCWV").toLowerCase()

  if (
    normalized === clanName ||
    normalized === "unknown" ||
    normalized === "none" ||
    normalized === "inactive" ||
    normalized === "no active war" ||
    normalized === "active battle unknown"
  ) {
    return null
  }

  return trimmed
}

async function fetchBotStatus() {
  if (!botAdminApiConfigured()) {
    return {
      connected: false,
      configured: false,
      data: null as BotStatus | null,
      error: "Bot admin API not configured",
    }
  }

  try {
    const data = await botAdminFetch<BotStatus>("/admin/status")
    return {
      connected: true,
      configured: true,
      data,
      error: null as string | null,
    }
  } catch (err) {
    return {
      connected: false,
      configured: true,
      data: null as BotStatus | null,
      error: err instanceof BotAdminApiError ? err.message : "Bot admin API unavailable",
    }
  }
}

export async function GET() {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  const now = new Date().toISOString()

  try {
    const [db, trackedPlayers, botStatus] = await Promise.all([
      databaseHealth().catch((err) => ({
        status: "Disconnected",
        latencyMs: null,
        error: err instanceof Error ? err.message : "Database check failed",
      })),
      countTrackedPlayers(),
      fetchBotStatus(),
    ])

    const botOverview = botStatus.data?.overview ?? {}
    const botInfo = botStatus.data?.bot ?? {}
    const currentWar = normalizeCurrentWar(botOverview.currentWar)

    return NextResponse.json({
      success: true,
      loadedAt: now,
      user: auth.user,
      overview: {
        botStatus: botStatus.connected ? "Online" : "Disconnected",
        uptimeSeconds: botOverview.uptimeSeconds ?? botInfo.uptimeSeconds ?? null,
        lastHeartbeat: botOverview.lastHeartbeat ?? botInfo.lastHeartbeat ?? null,
        databaseStatus: db.status,
        databaseLatencyMs: db.latencyMs,
        trackedPlayers: botOverview.trackedPlayers ?? trackedPlayers,
        activeGiveaway: botOverview.activeGiveaway ?? false,
        activeInviteEvent: botOverview.activeInviteEvent ?? false,
        currentWar: currentWar ?? "No active war",
      },
      bot: {
        connected: botStatus.connected,
        configured: botStatus.configured,
        error: botStatus.error,
        cpu: botInfo.cpu ?? null,
        ramMb: botInfo.ramMb ?? null,
        pingMs: botInfo.pingMs ?? null,
        guildCount: botInfo.guildCount ?? null,
        users: botInfo.users ?? null,
        commandsExecuted: botInfo.commandsExecuted ?? null,
        queueLengths: botInfo.queueLengths ?? {},
        loops: botStatus.data?.loops ?? {},
        database: db,
      },
      cards: [
        { label: "Bot Status", value: botStatus.connected ? "Online" : "Disconnected", icon: "🟢" },
        { label: "Uptime", value: botOverview.uptimeSeconds ?? botInfo.uptimeSeconds ?? null, icon: "⏱" },
        { label: "Last Heartbeat", value: botOverview.lastHeartbeat ?? botInfo.lastHeartbeat ?? null, icon: "❤️" },
        { label: "Database", value: db.status, icon: "🗄" },
        { label: "Tracked Players", value: botOverview.trackedPlayers ?? trackedPlayers, icon: "👥" },
        { label: "Active Giveaway", value: botOverview.activeGiveaway ? "Active" : "None", icon: "🎉" },
        { label: "Invite Event", value: botOverview.activeInviteEvent ? "Active" : "None", icon: "📨" },
        { label: "Current War", value: currentWar ?? "No active war", icon: "⚔" },
      ],
      recentActivity:
        Array.isArray(botStatus.data?.logs) && botStatus.data?.logs.length
          ? botStatus.data.logs.slice(0, 8)
          : [
              {
                id: "status-loaded",
                level: "info",
                message: "Admin status checked",
                createdAt: now,
              },
              {
                id: "db-health",
                level: db.status === "Connected" ? "info" : "error",
                message: `Database ${db.status.toLowerCase()}`,
                createdAt: now,
              },
              {
                id: "bot-health",
                level: botStatus.connected ? "info" : "warning",
                message: botStatus.connected
                  ? "Bot admin API connected"
                  : botStatus.error ?? "Bot admin API unavailable",
                createdAt: now,
              },
            ],
    })
  } catch (err) {
    console.error("[api/admin/status] error:", err)
    return NextResponse.json(
      { error: "Failed to load admin status" },
      { status: 500 }
    )
  }
}
