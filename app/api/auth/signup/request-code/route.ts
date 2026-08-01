import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi";
import { signupRateLimiter, getClientIP, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z.object({
  username: z.string().trim().min(3).max(32),
});

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function makeCode() {
  // Crypto-grade RNG (Math.random is predictable given enough samples).
  return String(crypto.randomInt(100000, 1000000));
}

// Server-side per-user DM cooldown: blocks bot-DM spam even if the caller
// bypasses the client-side resend timer (and regardless of source IP).
const DM_COOLDOWN_MS = 25_000;

async function ensureSignupVerificationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_verification_codes (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS signup_verification_user_idx ON signup_verification_codes (user_id, created_at DESC)`);
}

export async function POST(req: Request) {
  try {
    const clientIP = getClientIP(req);
    const rateLimitResult = signupRateLimiter.check(`verify:${clientIP}`);
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult);

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse({ username: body?.username });
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter your Roblox username first." }, { status: 400 });
    }

    const username = parsed.data.username;
    const existing = await pool.query<{
      id: number;
      username: string;
      password_hash: string | null;
      roblox_id: string | number | null;
      discord_id: string | number | null;
    }>(
      `SELECT id, username, password_hash, roblox_id, discord_id
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    );

    const user = existing.rows[0];
    if (!user?.roblox_id || !user?.discord_id) {
      return NextResponse.json(
        { error: "That Roblox account is not linked to an MCWV Discord member yet." },
        { status: 403 }
      );
    }

    if (user.password_hash) {
      return NextResponse.json({ error: "That account already has a Hub login." }, { status: 409 });
    }

    await ensureSignupVerificationTable();

    // DM cooldown: if a code went out to this user very recently, skip
    // sending another (still answer success — no state leaks, no spam).
    const recent = await pool.query<{ created_at: Date | string }>(
      `SELECT created_at
       FROM signup_verification_codes
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    const lastSentAt = recent.rows[0]?.created_at;
    if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < DM_COOLDOWN_MS) {
      return NextResponse.json({
        success: true,
        message: "A code was just sent — check your Discord DMs (it can take a minute to arrive).",
      });
    }

    const code = makeCode();
    await pool.query(
      `INSERT INTO signup_verification_codes (user_id, username, code_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
      [user.id, user.username, hashCode(code)]
    );

    try {
      await botAdminFetch("/admin/signup/verify-dm", {
        method: "POST",
        body: JSON.stringify({
          discord_id: String(user.discord_id),
          username: user.username,
          code,
        }),
      });
    } catch (err) {
      if (err instanceof BotAdminApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent. Check your Discord DMs from MCWV-BOT.",
    });
  } catch (err) {
    console.error("[auth/signup/request-code] error:", err);
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
  }
}
