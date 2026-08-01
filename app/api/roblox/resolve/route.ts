import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";

// Username -> Roblox userId lookup, used by the Hall of Fame form to attach
// a permanent avatar via /api/roblox/avatar?userId=<id>.
const ROBLOX_USERS_API = "https://users.roblox.com/v1/usernames/users";

export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const username = String(new URL(req.url).searchParams.get("username") ?? "").trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const res = await fetch(ROBLOX_USERS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "MCWV-Hub/1.0" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Roblox lookup failed" }, { status: 502 });
    }

    const json = await res.json().catch(() => null);
    const row = Array.isArray(json?.data) ? json.data[0] : null;
    const id = Number(row?.id);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Roblox user not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      userId: String(id),
      name: typeof row?.name === "string" && row.name ? row.name : username,
    });
  } catch {
    return NextResponse.json({ error: "Roblox lookup failed" }, { status: 502 });
  }
}
