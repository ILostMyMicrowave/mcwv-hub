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

type BattleRow = {
  battle_id: string;
  battle_name: string | null;
  start_time: Date | string | null;
  end_time: Date | string | null;
  final_rank: number | string | null;
  final_points: number | string | null;
  captured_at: Date | string | null;
};

type PlayerSnapshotRow = {
  battle_key: string;
  battle_id: string;
  roblox_id: string;
  username: string | null;
  points: number | string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
