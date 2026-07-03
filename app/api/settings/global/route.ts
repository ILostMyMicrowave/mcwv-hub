import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ---------------- GET GLOBAL SETTINGS ---------------- */
export async function GET() {
  try {
    const res = await pool.query(
      `SELECT * FROM global_settings ORDER BY id DESC LIMIT 1`
    );

    const row = res.rows[0];

    return NextResponse.json({
      discord_link: row?.discord_link ?? "",
      requirements: row?.requirements ?? "",
      banner_text: row?.banner_text ?? "",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load global settings",
      },
      { status: 500 }
    );
  }
}

/* ---------------- UPDATE GLOBAL SETTINGS ---------------- */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const discord_link = body.discord_link ?? "";
    const requirements = body.requirements ?? "";
    const banner_text = body.banner_text ?? "";

    // If no row exists, create one
    const existing = await pool.query(`SELECT id FROM global_settings LIMIT 1`);

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO global_settings (discord_link, requirements, banner_text)
         VALUES ($1, $2, $3)`,
        [discord_link, requirements, banner_text]
      );
    } else {
      await pool.query(
        `UPDATE global_settings
         SET discord_link = $1,
             requirements = $2,
             banner_text = $3,
             updated_at = NOW()
         WHERE id = (SELECT id FROM global_settings LIMIT 1)`,
        [discord_link, requirements, banner_text]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update global settings" },
      { status: 500 }
    );
  }
}
