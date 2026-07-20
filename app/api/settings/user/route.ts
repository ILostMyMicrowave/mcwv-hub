import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import pg from "pg";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ALLOWED_THEMES = new Set(["default", "ice", "inferno"]);

function normalizeTheme(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const theme = value.trim().toLowerCase();
  return ALLOWED_THEMES.has(theme) ? theme : null;
}

async function getAuthedUserId() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  return session.user?.id ?? null;
}

/* ---------------- GET USER THEME ---------------- */
export async function GET(req: Request) {
  try {
    const authedUserId = await getAuthedUserId();

    if (!authedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedUserIdRaw = url.searchParams.get("user_id");

    if (requestedUserIdRaw) {
      const requestedUserId = Number(requestedUserIdRaw);
      if (!Number.isFinite(requestedUserId) || requestedUserId !== authedUserId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const res = await pool.query(
      `
        SELECT theme
        FROM user_settings
        WHERE user_id = $1
        LIMIT 1
      `,
      [authedUserId]
    );

    const row = res.rows[0];

    return NextResponse.json({
      user_id: authedUserId,
      theme: row?.theme ?? "default",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load user settings" },
      { status: 500 }
    );
  }
}

/* ---------------- UPDATE USER THEME ---------------- */
export async function POST(req: Request) {
  try {
    const authedUserId = await getAuthedUserId();

    if (!authedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);

    const requestedUserIdRaw = body?.user_id;
    const requestedTheme = normalizeTheme(body?.theme);

    const requestedUserId = Number(requestedUserIdRaw);

    if (!Number.isFinite(requestedUserId) || requestedUserId !== authedUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!requestedTheme) {
      return NextResponse.json(
        { error: "Invalid theme" },
        { status: 400 }
      );
    }

    await pool.query(
      `
        INSERT INTO user_settings (user_id, theme, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          theme = EXCLUDED.theme,
          updated_at = NOW()
      `,
      [authedUserId, requestedTheme]
    );

    return NextResponse.json({ success: true, theme: requestedTheme });
  } catch {
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    );
  }
}
