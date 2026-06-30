import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql`
      SELECT name, points
      FROM leaderboard
      ORDER BY points DESC
      LIMIT 50;
    `;

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.log("DB ERROR:", err);

    return NextResponse.json({
      success: false,
      data: [],
      error: "Database query failed"
    });
  }
}
