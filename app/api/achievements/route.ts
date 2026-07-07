import { NextResponse } from "next/server";
import pg from "pg";

export const dynamic = "force-dynamic";

const { Pool } = pg;

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
});

type CurrentUser = {
id: number;
role: "member" | "officer" | "owner";
username: string;
} | null;

async function getCurrentUser(req: Request): Promise<CurrentUser> {
const cookie = req.headers.get("cookie") || "";
const match = cookie.match(/mcwv_user=([^;]+)/);

if (!match) return null;

const userId = Number(match[1]);
if (!Number.isFinite(userId)) return null;

const res = await pool.query(
"SELECT id, role, username FROM users WHERE id = $1 LIMIT 1",
[userId]
);

return res.rows[0] ?? null;
}

export async function GET() {
try {
const res = await pool.query(
"SELECT a.id, a.title, a.placement, a.war_number, a.description, a.date, a.created_by, a.created_at, u.username AS created_by_username FROM achievements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC, a.id DESC"
);

return NextResponse.json({ entries: res.rows });

} catch {
return NextResponse.json(
{ error: "Failed to load achievements" },
{ status: 500 }
);
}
}

export async function POST(req: Request) {
try {
const me = await getCurrentUser(req);

if (!me) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

if (me.role !== "owner") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

const body = await req.json().catch(() => ({}));

const title = String(body.title || "").trim();
const placement = String(body.placement || "").trim();
const warNumberRaw = body.war_number;
const description = String(body.description || "").trim();
const dateRaw = String(body.date || "").trim();

const warNumber =
  warNumberRaw === null || warNumberRaw === undefined || warNumberRaw === ""
    ? null
    : Number(warNumberRaw);

const date = dateRaw.length > 0 ? dateRaw : null;

if (!title) {
  return NextResponse.json({ error: "Title is required" }, { status: 400 });
}

if (!placement) {
  return NextResponse.json({ error: "Placement is required" }, { status: 400 });
}

if (!description) {
  return NextResponse.json(
    { error: "Description is required" },
    { status: 400 }
  );
}

if (warNumber !== null && !Number.isFinite(warNumber)) {
  return NextResponse.json(
    { error: "War number must be a valid number" },
    { status: 400 }
  );
}

const res = await pool.query(
  `INSERT INTO achievements (
    title,
    placement,
    war_number,
    description,
    date,
    created_by
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING
    id,
    title,
    placement,
    war_number,
    description,
    date,
    created_by,
    created_at`,
  [title, placement, warNumber, description, date, me.id]
);

return NextResponse.json({ success: true, entry: res.rows[0] });

} catch {
return NextResponse.json(
{ error: "Failed to add achievement" },
{ status: 500 }
);
}
}
