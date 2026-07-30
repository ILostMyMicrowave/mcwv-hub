import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireAdminUser } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;

const updateSchema = z.object({
  robloxId: z.string().trim().regex(/^\d+$/, "Invalid Roblox ID"),
  manualGrade: z.enum(GRADES).nullable().optional(),
  staffNote: z.string().max(1200).nullable().optional(),
});

async function ensureOverridesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS war_report_member_overrides (
      id BIGSERIAL PRIMARY KEY,
      battle_id TEXT NOT NULL,
      roblox_id TEXT NOT NULL,
      manual_grade TEXT,
      staff_note TEXT,
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (battle_id, roblox_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS war_report_member_overrides_battle_idx ON war_report_member_overrides (battle_id)`);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const auth = await requireAdminUser("officer");
  if (!auth.ok) return auth.response;

  try {
    const { battleId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid report update" },
        { status: 400 }
      );
    }

    await ensureOverridesTable();

    const note = parsed.data.staffNote?.trim() ?? null;
    const grade = parsed.data.manualGrade ?? null;

    const result = await pool.query(
      `INSERT INTO war_report_member_overrides (
         battle_id,
         roblox_id,
         manual_grade,
         staff_note,
         updated_by,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (battle_id, roblox_id)
       DO UPDATE SET
         manual_grade = EXCLUDED.manual_grade,
         staff_note = EXCLUDED.staff_note,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING battle_id, roblox_id, manual_grade, staff_note, updated_at`,
      [battleId, parsed.data.robloxId, grade, note, auth.user.id]
    );

    return NextResponse.json({ success: true, override: result.rows[0] });
  } catch (err) {
    console.error("[war-reports] member update error:", err);
    return NextResponse.json({ error: "Failed to update report member" }, { status: 500 });
  }
}
