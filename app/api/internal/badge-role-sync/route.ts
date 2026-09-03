import { NextResponse } from "next/server";
import { maybeAutoSyncBadgeRoles } from "@/lib/badgeRoleSync";
import { isBotAdminAuthorized, unauthorizedMachineResponse } from "@/lib/machineAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isBotAdminAuthorized(request)) {
    return unauthorizedMachineResponse();
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
