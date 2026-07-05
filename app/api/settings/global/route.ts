import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// helper to get user from cookie
async function getUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/mcwv_user=([^;]+)/);

  if (!match) return null;

  const userId = Number(match[1]);
  if (!Number.isFinite(userId)) return null;

  const res = await pool.query(
    `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  return res.rows[0] ?? null;
}

export async function GET() {
  try {
    const res = await pool.query(
      `SELECT discord_link, requirements_text, banner_text, banner_speed, updated_at
       FROM global_settings
       WHERE id = 1
       LIMIT 1`
    );

    const row = res.rows[0];

    return NextResponse.json({
      discord_link: row?.discord_link ?? "",
      requirements_text: row?.requirements_text ?? "",
      banner_text: row?.banner_text ?? "",
      banner_speed: row?.banner_speed ?? 18,
      updated_at: row?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load global settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser(req);

    // ❌ not logged in
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ❌ only officer+ can edit
    if (!["officer", "owner"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const discord_link = body.discord_link ?? "";
    const requirements_text = body.requirements_text ?? "";
    const banner_text = body.banner_text ?? "";
    const banner_speed = Number(body.banner_speed ?? 18);

    await pool.query(
      `
      INSERT INTO global_settings (
        id,
        discord_link,
        requirements_text,
        banner_text,
        banner_speed,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        discord_link = EXCLUDED.discord_link,
        requirements_text = EXCLUDED.requirements_text,
        banner_text = EXCLUDED.banner_text,
        banner_speed = EXCLUDED.banner_speed,
        updated_at = NOW()
      `,
      [discord_link, requirements_text, banner_text, banner_speed]
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update global settings" },
      { status: 500 }
    );
  }
}
