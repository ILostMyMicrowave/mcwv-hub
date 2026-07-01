import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get("x-api-key");

    if (apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { battle_name, entries } = body;

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const client = await pool.connect();

    try {
      await client.query("DELETE FROM live_leaderboard");

      for (const e of entries) {
        await client.query(
          `
          INSERT INTO live_leaderboard (
            roblox_id,
            username,
            discord_id,
            points,
            rank,
            avatar,
            battle_name
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            String(e.user_id),
            e.name,
            e.discord_id || null,
            Number(e.points),
            Number(e.rank),
            e.avatar || null,
            battle_name,
          ]
        );
      }

      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
