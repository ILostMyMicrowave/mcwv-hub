import { NextResponse } from "next/server";
import { maybeAutoSyncBadgeRoles } from "@/lib/badgeRoleSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function authorized(request: Request) {
  const authHeader = request.headers.get("x-admin-api-key") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  const provided = authHeader || (
    bearer.toLowerCase().startsWith("bearer ")
      ? bearer.split(" ")[1]
      : ""
  );
  const expected = process.env.BOT_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? "";
  return Boolean(expected && provided && provided === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await maybeAutoSyncBadgeRoles({
      // The bot calls every 20 minutes. An 18-minute stale window absorbs
      // request/runtime drift so successful runs do not accidentally alternate.
      staleMs: 18 * 60 * 1000,
      trigger: "bot-schedule",
      budgetMs: 45_000,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[badge-role-schedule] sync failed:", error);
    return NextResponse.json(
      { success: false, error: "Badge role sync failed" },
      { status: 500 }
    );
  }
}
