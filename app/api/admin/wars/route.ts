import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BattleRow = {
  battle_id: string;
  battle_name: string | null;
  start_time: Date | string | null;
  end_time: Date | string | null;
  manually_edited: boolean | null;
  edited_by: string | number | null;
  edited_at: Date | string | null;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function serializeBattle(row: BattleRow) {
  return {
    battleId: row.battle_id,
    battleName: row.battle_name,
    startTime: toIso(row.start_time),
    endTime: toIso(row.end_time),
    manuallyEdited: Boolean(row.manually_edited),
    editedBy: row.edited_by ? String(row.edited_by) : null,
    editedAt: toIso(row.edited_at),
  };
}

export async function GET() {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  try {
    const res = await pool.query<BattleRow>(
      `SELECT battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at
       FROM battles
       ORDER BY COALESCE(start_time, end_time, created_at, NOW()) DESC
       LIMIT 200`
    );
    return NextResponse.json({ battles: res.rows.map(serializeBattle) });
  } catch (err) {
    console.error("[admin/wars] list failed:", err);
    return NextResponse.json({ error: "Failed to load battles" }, { status: 500 });
  }
}

const createSchema = z.object({
  battleId: z
    .string()
    .trim()
    .min(1, "Battle ID is required")
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/, "Battle ID can only contain letters, numbers, _ and -"),
  battleName: z.string().trim().max(120).optional().nullable(),
  startTime: z.string().trim().nullable().optional(),
  endTime: z.string().trim().nullable().optional(),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(req: Request) {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { battleId, battleName, startTime, endTime } = parsed.data;

  const start = parseDate(startTime);
  const end = parseDate(endTime);
  if (startTime && !start) return NextResponse.json({ error: "startTime is not a valid date" }, { status: 400 });
  if (endTime && !end) return NextResponse.json({ error: "endTime is not a valid date" }, { status: 400 });
  if (start && end && start.getTime() >= end.getTime()) {
    return NextResponse.json({ error: "Start must be before end" }, { status: 400 });
  }

  const hasDates = Boolean(start || end);

  try {
    const res = await pool.query<BattleRow>(
      `INSERT INTO battles (battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (battle_id) DO UPDATE SET
         battle_name = COALESCE(EXCLUDED.battle_name, battles.battle_name),
         start_time  = COALESCE(EXCLUDED.start_time, battles.start_time),
         end_time    = COALESCE(EXCLUDED.end_time, battles.end_time),
         manually_edited = CASE WHEN $5 THEN TRUE ELSE battles.manually_edited END,
         edited_by   = CASE WHEN $5 THEN EXCLUDED.edited_by ELSE battles.edited_by END,
         edited_at   = CASE WHEN $5 THEN NOW() ELSE battles.edited_at END
       RETURNING battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at`,
      [battleId, battleName || battleId, start, end, hasDates, auth.user.id]
    );

    await logAdminAction({
      event: "war_schedule_created",
      message: `Battle ${battleId} ${hasDates ? "created with manual dates" : "created"}`,
      action: "wars/create",
      actor: auth.user,
      metadata: { battleId, startTime: toIso(start), endTime: toIso(end), manual: hasDates },
    });

    return NextResponse.json({ battle: serializeBattle(res.rows[0]) });
  } catch (err) {
    console.error("[admin/wars] create failed:", err);
    return NextResponse.json({ error: "Failed to save battle" }, { status: 500 });
  }
}
