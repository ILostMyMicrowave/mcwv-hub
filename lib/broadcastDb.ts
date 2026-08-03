import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

// ---------------------------------------------------------------------------
// Shared Neon tables created by the bot (see main.py: broadcast_templates,
// broadcast_sends, broadcast_recipients, broadcast_schedules). The hub reads
// and writes them directly; the bot is the only thing that SENDS messages.
// ---------------------------------------------------------------------------

export const TEMPLATE_AUDIENCES = new Set([
  "everyone",
  "below_points",
  "above_points",
  "zero_points",
  "bottom_n",
  "top_n",
  "members",
  "officers",
  "discord_role",
  "custom_user",
])

// Schedules run headless in the bot, which resolves recipients without a
// Discord role picker or custom user list — those two audiences are manual
// sends only.
export const SCHEDULE_AUDIENCES = new Set([
  "everyone",
  "below_points",
  "above_points",
  "zero_points",
  "bottom_n",
  "top_n",
  "members",
  "officers",
])

export const BROADCAST_DELIVERIES = new Set(["dm", "ticket"])
export const BROADCAST_STYLES = new Set(["plain", "embed"])
export const SCHEDULE_KINDS = new Set(["one_time", "war_midpoint", "war_final_hours", "war_end_congrats"])

const VALUE_AUDIENCES = new Set(["below_points", "above_points", "bottom_n", "top_n", "custom_user"])

// --------------------------------------------------------------------------
// Table existence guard (bot creates tables on boot; cache positives 60s)
// --------------------------------------------------------------------------

let tablesCache: { at: number; ok: boolean } = { at: 0, ok: false }

export async function broadcastTablesExist(force = false): Promise<boolean> {
  const now = Date.now()
  if (!force && tablesCache.ok && now - tablesCache.at < 60_000) return true

  try {
    const result = await pool.query(
      `SELECT
         to_regclass('public.broadcast_templates') AS templates,
         to_regclass('public.broadcast_sends') AS sends,
         to_regclass('public.broadcast_recipients') AS recipients,
         to_regclass('public.broadcast_schedules') AS schedules`
    )
    const row = (result.rows[0] ?? {}) as Record<string, string | null>
    const ok = Object.values(row).every((value) => value !== null)
    if (ok) tablesCache = { at: now, ok: true }
    return ok
  } catch (err) {
    console.error("[broadcast db] table check failed:", err)
    return false
  }
}

export function missingTablesResponse() {
  return NextResponse.json(
    {
      error:
        "Broadcast tables not found yet. The bot creates them on boot — upload the latest main.py on Render, restart the bot, then retry.",
      missingTables: true,
    },
    { status: 503 }
  )
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

type Validation<T> = { ok: true; data: T } | { ok: false; error: string }

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function cleanChoice(value: unknown, allowed: Set<string>, fallback: string): string {
  const choice = clean(value, 40).toLowerCase()
  return allowed.has(choice) ? choice : fallback
}

function cleanInt(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const int = Math.trunc(parsed)
  return int >= min && int <= max ? int : null
}

function cleanFloat(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed >= min && parsed <= max ? Math.round(parsed * 100) / 100 : null
}

export type BroadcastTemplateInput = {
  name: string
  audience: string
  value: string
  delivery: string
  style: string
  message: string
}

export function sanitizeTemplateInput(body: unknown): Validation<BroadcastTemplateInput> {
  const record = (body ?? {}) as Record<string, unknown>

  const name = clean(record.name, 60)
  if (!name) return { ok: false, error: "Template name is required (max 60 characters)." }

  const audience = cleanChoice(record.audience, TEMPLATE_AUDIENCES, "everyone")
  const value = clean(record.value, 200)
  if (VALUE_AUDIENCES.has(audience) && !value) {
    return { ok: false, error: "This audience needs a filter value." }
  }

  const delivery = cleanChoice(record.delivery, BROADCAST_DELIVERIES, "dm")
  const style = cleanChoice(record.style, BROADCAST_STYLES, "plain")

  const message = clean(record.message, 1900)
  if (!message) return { ok: false, error: "Message is required." }

  return { ok: true, data: { name, audience, value, delivery, style, message } }
}

export type BroadcastScheduleInput = {
  name: string
  kind: string
  audience: string
  value: string
  delivery: string
  style: string
  message: string
  topN: number | null
  hoursBeforeEnd: number | null
  runAt: string | null
  enabled: boolean
}

export function sanitizeScheduleInput(
  body: unknown,
  { alreadyFired = false }: { alreadyFired?: boolean } = {}
): Validation<BroadcastScheduleInput> {
  const record = (body ?? {}) as Record<string, unknown>

  const name = clean(record.name, 80)
  if (!name) return { ok: false, error: "Schedule name is required (max 80 characters)." }

  const kind = clean(record.kind, 40).toLowerCase()
  if (!SCHEDULE_KINDS.has(kind)) {
    return { ok: false, error: "Unknown schedule kind." }
  }

  const audience =
    kind === "war_end_congrats"
      ? "everyone"
      : cleanChoice(record.audience, SCHEDULE_AUDIENCES, "everyone")

  const value = clean(record.value, 200)
  if (kind !== "war_end_congrats" && VALUE_AUDIENCES.has(audience) && !value) {
    return { ok: false, error: "This audience needs a filter value." }
  }

  const delivery = cleanChoice(record.delivery, BROADCAST_DELIVERIES, "dm")
  const style = cleanChoice(record.style, BROADCAST_STYLES, "plain")

  const message = clean(record.message, 1900)
  if (!message) return { ok: false, error: "Message is required." }

  let topN: number | null = null
  if (kind === "war_end_congrats") {
    topN = cleanInt(record.topN ?? record.top_n, 1, 500) ?? 10
  }

  let hoursBeforeEnd: number | null = null
  if (kind === "war_final_hours") {
    hoursBeforeEnd = cleanFloat(record.hoursBeforeEnd ?? record.hours_before_end, 0.5, 168) ?? 24
  }

  const enabled = Boolean(record.enabled ?? true)

  let runAt: string | null = null
  if (kind === "one_time") {
    const raw = clean(record.runAt ?? record.run_at, 60)
    const parsed = raw ? new Date(raw) : null
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Pick a valid date & time for this one-time broadcast." }
    }
    // Future-check only when it could actually fire: fired schedules are done,
    // disabled ones are inert (you must set a fresh time to re-enable).
    if (enabled && !alreadyFired && parsed.getTime() <= Date.now() + 30_000) {
      return {
        ok: false,
        error: "One-time broadcasts need a time at least a minute in the future.",
      }
    }
    runAt = parsed.toISOString()
  }

  return {
    ok: true,
    data: {
      name,
      kind,
      audience,
      value,
      delivery,
      style,
      message,
      topN,
      hoursBeforeEnd,
      runAt,
      enabled,
    },
  }
}

// --------------------------------------------------------------------------
// Row mappers
// --------------------------------------------------------------------------

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function mapTemplateRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    audience: String(row.audience ?? "everyone"),
    value: String(row.value ?? ""),
    delivery: String(row.delivery ?? "dm"),
    style: String(row.style ?? "plain"),
    message: String(row.message ?? ""),
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedAt: toIso(row.updated_at),
  }
}

export function mapScheduleRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    kind: String(row.kind ?? "one_time"),
    audience: String(row.audience ?? "everyone"),
    value: String(row.value ?? ""),
    delivery: String(row.delivery ?? "dm"),
    style: String(row.style ?? "plain"),
    message: String(row.message ?? ""),
    topN: row.top_n === null || row.top_n === undefined ? null : Number(row.top_n),
    hoursBeforeEnd:
      row.hours_before_end === null || row.hours_before_end === undefined
        ? null
        : Number(row.hours_before_end),
    runAt: toIso(row.run_at),
    enabled: Boolean(row.enabled),
    createdBy: row.created_by ? String(row.created_by) : null,
    lastFiredAt: toIso(row.last_fired_at),
    lastFiredBattle: row.last_fired_battle ? String(row.last_fired_battle) : null,
  }
}

export function mapSendRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    actor: row.actor ? String(row.actor) : null,
    source: String(row.source ?? "discord"),
    templateId: row.template_id === null || row.template_id === undefined ? null : Number(row.template_id),
    audience: row.audience ? String(row.audience) : null,
    value: row.value ? String(row.value) : null,
    delivery: row.delivery ? String(row.delivery) : null,
    style: row.style ? String(row.style) : null,
    message: String(row.message ?? ""),
    battleKey: row.battle_key ? String(row.battle_key) : null,
    matchedCount: Number(row.matched_count ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    status: String(row.status ?? "done"),
    sentAt: toIso(row.sent_at),
    conversionCheckedAt: toIso(row.conversion_checked_at),
    conversionZeroAtSend:
      row.conversion_zero_at_send === null || row.conversion_zero_at_send === undefined
        ? null
        : Number(row.conversion_zero_at_send),
    conversionScorers:
      row.conversion_scorers === null || row.conversion_scorers === undefined
        ? null
        : Number(row.conversion_scorers),
    conversionPoints:
      row.conversion_points === null || row.conversion_points === undefined
        ? null
        : Number(row.conversion_points),
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
}
