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

const editSchema = z.object({
  startTime: z.string().trim().nullable().optional(),
  endTime: z.string().trim().nullable().optional(),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function loadBattle(battleId: string): Promise<BattleRow | null> {
  const res = await pool.query<BattleRow>(
    `SELECT battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at
     FROM battles WHERE battle_id = $1 LIMIT 1`,
    [battleId]
  );
  return res.rows[0] ?? null;
}

/** Manually set start/end dates. Pass null to clear a date. Marks the row as a manual override. */
export async function PATCH(req: Request, ctx: { params: Promise<{ battleId: string }> }) {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  const { battleId } = await ctx.params;
  if (!battleId || battleId.length > 80 || !/^[A-Za-z0-9_-]+$/.test(battleId)) {
    return NextResponse.json({ error: "Invalid battleId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { startTime, endTime } = parsed.data;
  if (startTime === undefined && endTime === undefined) {
    return NextResponse.json({ error: "Provide startTime and/or endTime (null clears a date)" }, { status: 400 });
  }

  const start = startTime === undefined ? undefined : parseDate(startTime);
  const end = endTime === undefined ? undefined : parseDate(endTime);
  if (startTime != null && startTime !== undefined && !start) {
    return NextResponse.json({ error: "startTime is not a valid date" }, { status: 400 });
  }
  if (endTime != null && endTime !== undefined && !end) {
    return NextResponse.json({ error: "endTime is not a valid date" }, { status: 400 });
  }
  if (start && end && start.getTime() >= end.getTime()) {
    return NextResponse.json({ error: "Start must be before end" }, { status: 400 });
  }

  try {
    const existing = await loadBattle(battleId);
    const nextStart = start === undefined ? existing?.start_time ?? null : start;
    const nextEnd = end === undefined ? existing?.end_time ?? null : end;
    if (nextStart && nextEnd && new Date(nextStart).getTime() >= new Date(nextEnd).getTime()) {
      return NextResponse.json({ error: "Resulting dates are invalid: start must be before end" }, { status: 400 });
    }

    const res = await pool.query<BattleRow>(
      `INSERT INTO battles (battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at)
       VALUES ($1, $1, $2, $3, TRUE, $4, NOW())
       ON CONFLICT (battle_id) DO UPDATE SET
         start_time = EXCLUDED.start_time,
         end_time   = EXCLUDED.end_time,
         manually_edited = TRUE,
         edited_by  = EXCLUDED.edited_by,
         edited_at  = NOW()
       RETURNING battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at`,
      [battleId, nextStart, nextEnd, auth.user.id]
    );

    await logAdminAction({
      event: "war_schedule_edited",
      message: `Battle ${battleId} dates manually edited`,
      action: "wars/edit",
      actor: auth.user,
      metadata: { battleId, startTime: toIso(nextStart), endTime: toIso(nextEnd) },
    });

    return NextResponse.json({ battle: serializeBattle(res.rows[0]) });
  } catch (err) {
    console.error("[admin/wars] edit failed:", err);
    return NextResponse.json({ error: "Failed to save battle dates" }, { status: 500 });
  }
}

/** Reset to API control (manual override off). */
export async function POST(req: Request, ctx: { params: Promise<{ battleId: string }> }) {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  const { battleId } = await ctx.params;
  try {
    const res = await pool.query<BattleRow>(
      `UPDATE battles
       SET manually_edited = FALSE, edited_by = NULL, edited_at = NOW()
       WHERE battle_id = $1
       RETURNING battle_id, battle_name, start_time, end_time, manually_edited, edited_by, edited_at`,
      [battleId]
    );

    await logAdminAction({
      event: "war_schedule_reset",
      message: `Battle ${battleId} reset to API control`,
      action: "wars/reset",
      actor: auth.user,
      metadata: { battleId },
    });

    if (!res.rows.length) return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    return NextResponse.json({ battle: serializeBattle(res.rows[0]) });
  } catch (err) {
    console.error("[admin/wars] reset failed:", err);
    return NextResponse.json({ error: "Failed to reset battle" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ battleId: string }> }) {
  const auth = await requireAdminUser("owner");
  if (!auth.ok) return auth.response;

  const { battleId } = await ctx.params;
  try {
    const res = await pool.query(`DELETE FROM battles WHERE battle_id = $1 RETURNING battle_id`, [battleId]);

    await logAdminAction({
      event: "war_schedule_deleted",
      message: `Battle ${battleId} deleted from the schedule`,
      action: "wars/delete",
      actor: auth.user,
      metadata: { battleId },
    });

    if (!res.rows.length) return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/wars] delete failed:", err);
    return NextResponse.json({ error: "Failed to delete battle" }, { status: 500 });
  }
}
