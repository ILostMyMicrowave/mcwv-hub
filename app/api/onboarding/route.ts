import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { z } from "zod";
import { pool } from "@/lib/db";
import { sessionOptions, type SessionData } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OnboardingUser = {
  id: number;
  username: string;
  role: string | null;
  onboarding_completed: boolean | null;
  onboarding_skipped: boolean | null;
  onboarding_completed_at: Date | string | null;
  onboarding_step: string | null;
};

const updateSchema = z.object({
  action: z.enum(["complete", "skip", "reset", "step"]),
  step: z.string().trim().max(80).optional(),
});

async function ensureOnboardingColumns() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step TEXT`);
}

async function getSessionUserId() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const userId = Number(session.user?.id);
  return Number.isFinite(userId) ? userId : null;
}

function isOfficer(role: string | null | undefined) {
  return role === "officer" || role === "owner";
}

function buildPayload(user: OnboardingUser) {
  const completed = Boolean(user.onboarding_completed);
  const skipped = Boolean(user.onboarding_skipped);

  return {
    success: true,
    user: {
      id: Number(user.id),
      username: user.username,
      role: user.role ?? "member",
      isOfficer: isOfficer(user.role),
    },
    onboarding: {
      completed,
      skipped,
      shouldStart: !completed && !skipped,
      step: user.onboarding_step ?? "welcome",
      completedAt: user.onboarding_completed_at
        ? new Date(user.onboarding_completed_at).toISOString()
        : null,
    },
  };
}

async function getOnboardingUser(userId: number) {
  const result = await pool.query<OnboardingUser>(
    `SELECT id,
            username,
            role,
            onboarding_completed,
            onboarding_skipped,
            onboarding_completed_at,
            onboarding_step
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureOnboardingColumns();

    const user = await getOnboardingUser(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(buildPayload(user));
  } catch (err) {
    console.error("[onboarding] GET error:", err);
    return NextResponse.json({ error: "Failed to load onboarding status" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid onboarding action" },
        { status: 400 }
      );
    }

    await ensureOnboardingColumns();

    if (parsed.data.action === "complete") {
      await pool.query(
        `UPDATE users
         SET onboarding_completed = TRUE,
             onboarding_skipped = FALSE,
             onboarding_completed_at = NOW(),
             onboarding_step = 'done'
         WHERE id = $1`,
        [userId]
      );
    }

    if (parsed.data.action === "skip") {
      await pool.query(
        `UPDATE users
         SET onboarding_completed = FALSE,
             onboarding_skipped = TRUE,
             onboarding_completed_at = NULL,
             onboarding_step = 'skipped'
         WHERE id = $1`,
        [userId]
      );
    }

    if (parsed.data.action === "reset") {
      await pool.query(
        `UPDATE users
         SET onboarding_completed = FALSE,
             onboarding_skipped = FALSE,
             onboarding_completed_at = NULL,
             onboarding_step = 'welcome'
         WHERE id = $1`,
        [userId]
      );
    }

    if (parsed.data.action === "step") {
      await pool.query(
        `UPDATE users
         SET onboarding_step = $2
         WHERE id = $1`,
        [userId, parsed.data.step || "welcome"]
      );
    }

    const user = await getOnboardingUser(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(buildPayload(user));
  } catch (err) {
    console.error("[onboarding] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update onboarding" }, { status: 500 });
  }
}
