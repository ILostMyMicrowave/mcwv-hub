import { pool } from "@/lib/db";

export type EndSnapshotRow = {
  roblox_id: string;
  username: string | null;
  rank: number | string | null;
  points: number | string | null;
  captured_at: Date | string | null;
  in_final: boolean;
};

export function normalizeBattleKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

function toEndDate(endTime: Date | string | null | undefined) {
  if (!endTime) return null;
  const date = endTime instanceof Date ? endTime : new Date(endTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * People in MCWV at the last hourly snapshot at/before the war end time
 * (the date you set in /setwartime). Not the live clan, not everyone who
 * ever appeared in player_leaderboard_history.
 */
export async function loadEndOfWarSnapshot(
  battleId: string,
  endTime: Date | string | null | undefined
): Promise<EndSnapshotRow[]> {
  const battleKey = normalizeBattleKey(battleId);
  if (!battleKey) return [];
  if (!(await tableExists("hourly_stats_player_snapshots"))) return [];
  const end = toEndDate(endTime);

  try {
    const hourly = await pool.query<EndSnapshotRow>(
      `SELECT
         roblox_id::text AS roblox_id,
         username,
         rank,
         points,
         scheduled_at AS captured_at,
         TRUE AS in_final
       FROM hourly_stats_player_snapshots
       WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
         AND scheduled_at = (
           SELECT MAX(scheduled_at)
           FROM hourly_stats_player_snapshots
           WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = $1
             AND ($2::timestamptz IS NULL OR scheduled_at <= $2)
         )`,
      [battleKey, end]
    );
    return hourly.rows;
  } catch {
    return [];
  }
}

export async function loadEndOfWarSnapshotsForBattles(
  battles: Array<{ battleId: string; endTime: Date | string | null | undefined }>
): Promise<Map<string, EndSnapshotRow[]>> {
  const out = new Map<string, EndSnapshotRow[]>();
  if (!(await tableExists("hourly_stats_player_snapshots")) || !battles.length) return out;

  const keys = [...new Set(battles.map((b) => normalizeBattleKey(b.battleId)).filter(Boolean))];
  const endByKey = new Map<string, Date | null>();
  for (const b of battles) {
    const key = normalizeBattleKey(b.battleId);
    if (key) endByKey.set(key, toEndDate(b.endTime));
  }

  try {
    const result = await pool.query<EndSnapshotRow & { battle_key: string }>(
      `WITH keyed AS (
         SELECT
           regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') AS battle_key,
           roblox_id::text AS roblox_id,
           username,
           rank,
           points,
           scheduled_at AS captured_at
         FROM hourly_stats_player_snapshots
         WHERE regexp_replace(lower(battle_id), '[^a-z0-9]+', '', 'g') = ANY($1::text[])
       ),
       last_slot AS (
         SELECT battle_key, MAX(captured_at) AS ts
         FROM keyed
         GROUP BY battle_key
       )
       SELECT k.battle_key, k.roblox_id, k.username, k.rank, k.points, k.captured_at, TRUE AS in_final
       FROM keyed k
       JOIN last_slot l ON l.battle_key = k.battle_key AND k.captured_at = l.ts`,
      [keys]
    );

    for (const row of result.rows) {
      const key = String(row.battle_key || "");
      const end = endByKey.get(key);
      if (end && row.captured_at) {
        const captured = row.captured_at instanceof Date ? row.captured_at : new Date(String(row.captured_at));
        if (!Number.isNaN(captured.getTime()) && captured.getTime() > end.getTime()) continue;
      }
      const list = out.get(key) ?? [];
      list.push(row);
      out.set(key, list);
    }

    // If MAX(scheduled_at) was after end_time we dropped everyone — refill per battle.
    for (const key of keys) {
      if ((out.get(key) ?? []).length) continue;
      const rows = await loadEndOfWarSnapshot(key, endByKey.get(key) ?? null);
      if (rows.length) out.set(key, rows);
    }
  } catch {
    for (const b of battles) {
      const key = normalizeBattleKey(b.battleId);
      out.set(key, await loadEndOfWarSnapshot(b.battleId, b.endTime));
    }
  }

  return out;
}
