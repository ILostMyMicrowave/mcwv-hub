import { pool } from "@/lib/db";

function toDate(value: number | string | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toDate(numeric);

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

async function ensureWarDetectionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS war_detection_windows (
      battle_id TEXT PRIMARY KEY,
      battle_name TEXT,
      first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      api_start_at TIMESTAMPTZ,
      api_end_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE war_detection_windows ADD COLUMN IF NOT EXISTS battle_id TEXT`);
  await pool.query(`ALTER TABLE war_detection_windows ADD COLUMN IF NOT EXISTS battle_name TEXT`);
  await pool.query(`ALTER TABLE war_detection_windows ADD COLUMN IF NOT EXISTS first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE war_detection_windows ADD COLUMN IF NOT EXISTS api_start_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE war_detection_windows ADD COLUMN IF NOT EXISTS api_end_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE war_detection_windows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS war_detection_windows_battle_id_key ON war_detection_windows (battle_id)`);
}

export async function getDetectedWarWindow({
  battleId,
  battleName,
  apiStart,
  apiEnd,
}: {
  battleId: string;
  battleName?: string | null;
  apiStart?: number | string | Date | null;
  apiEnd?: number | string | Date | null;
}) {
  const safeBattleId = String(battleId || "").trim();
  if (!safeBattleId) return null;

  const startDate = toDate(apiStart);
  const endDate = toDate(apiEnd);

  await ensureWarDetectionTable();

  const result = await pool.query<{
    first_detected_at: Date | string;
    api_start_at: Date | string | null;
    api_end_at: Date | string | null;
  }>(
    `INSERT INTO war_detection_windows (
       battle_id,
       battle_name,
       first_detected_at,
       api_start_at,
       api_end_at,
       updated_at
     ) VALUES ($1, $2, NOW(), $3, $4, NOW())
     ON CONFLICT (battle_id)
     DO UPDATE SET
       battle_name = COALESCE(EXCLUDED.battle_name, war_detection_windows.battle_name),
       api_start_at = COALESCE(EXCLUDED.api_start_at, war_detection_windows.api_start_at),
       api_end_at = COALESCE(EXCLUDED.api_end_at, war_detection_windows.api_end_at),
       updated_at = NOW()
     RETURNING first_detected_at, api_start_at, api_end_at`,
    [safeBattleId, battleName || null, startDate, endDate]
  );

  const row = result.rows[0];
  const detectedStart = toDate(row.first_detected_at) ?? startDate;
  const detectedEnd = toDate(row.api_end_at) ?? endDate;

  return {
    battleId: safeBattleId,
    start: detectedStart,
    end: detectedEnd,
    startIso: detectedStart ? detectedStart.toISOString() : null,
    endIso: detectedEnd ? detectedEnd.toISOString() : null,
    apiStartIso: startDate ? startDate.toISOString() : null,
    apiEndIso: endDate ? endDate.toISOString() : null,
  };
}
