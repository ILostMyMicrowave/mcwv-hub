import { pool } from "@/lib/db";
import { RateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Honest health check for uptime monitors: ONE database round trip, nothing
// else. /api/app-status is a canary that also mirrors push jobs and war
// presence sweeps (5-6 serial DB operations), so during pooler waves it can
// legitimately take minutes and fires noisy monitor alerts. This route
// answers the only question a monitor should ask: is the app up, and can it
// reach the database at all? Point uptime monitors here.
const healthLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 checks per 5 min per IP
});

export async function GET(req: Request) {
  const limit = healthLimiter.check(getClientIP(req));
  if (!limit.success) return rateLimitResponse(limit);

  const started = Date.now();
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        error: err instanceof Error ? err.message : "database check failed",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
