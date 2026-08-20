import crypto from "crypto";
import { pool } from "@/lib/db";

// Big Games / PS99 OAuth (Authorization Code + PKCE, S256).
// Docs: https://github.com/BIG-Games-LLC/ps99-public-api-docs
//
// This app holds a server-side access token per hub user who authorized the
// "MCWV Bot" developer app. The token lets us read THEIR full PS99 account
// data (/v1/account/*) even when their publicViews are off.

export const BIG_GAMES_AUTHORIZE_URL = "https://db.biggames.io/oauth/authorize";
export const BIG_GAMES_TOKEN_URL = "https://db.biggames.io/oauth/token";
export const BIG_GAMES_API = "https://ps99.biggamesapi.io";

// The profile page requests the views it already renders. Add more scope keys
// here as the app uses them; only scopes registered against the app work.
export const BIG_GAMES_SCOPES = [
  "player-data:pet-simulator-99:profile:read",
  "player-data:pet-simulator-99:inventory:read",
  "player-data:pet-simulator-99:extendedProfile:read",
];

export function bigGamesConfigured() {
  return Boolean(process.env.BIG_GAMES_CLIENT_ID && process.env.BIG_GAMES_CLIENT_SECRET);
}

export function bigGamesRedirectUri() {
  return (
    process.env.BIG_GAMES_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app"}/api/biggames/callback`
  );
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

export function generatePkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url"); // 64 chars, url-safe
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function generateState() {
  return crypto.randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Token storage — one row per hub user, secret server-side only.
// ---------------------------------------------------------------------------

async function ensureBigGamesTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS big_games_tokens (
      user_id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      roblox_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS big_games_pkce (
      state TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      code_verifier TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function savePkce(state: string, userId: number, verifier: string) {
  await ensureBigGamesTables();
  await pool.query(
    `INSERT INTO big_games_pkce (state, user_id, code_verifier)
     VALUES ($1, $2, $3)
     ON CONFLICT (state) DO UPDATE SET user_id = EXCLUDED.user_id, code_verifier = EXCLUDED.code_verifier`,
    [state, userId, verifier]
  );
}

export async function consumePkce(state: string) {
  await ensureBigGamesTables();
  const { rows } = await pool.query(
    `SELECT user_id, code_verifier FROM big_games_pkce WHERE state = $1 LIMIT 1`,
    [state]
  );
  if (rows[0]) {
    await pool.query(`DELETE FROM big_games_pkce WHERE state = $1`, [state]);
  }
  return rows[0] ?? null;
}

export async function saveAccessToken(
  userId: number,
  accessToken: string,
  scope: string,
  robloxId: string | null
) {
  await ensureBigGamesTables();
  await pool.query(
    `INSERT INTO big_games_tokens (user_id, access_token, scope, roblox_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       scope = EXCLUDED.scope,
       roblox_id = EXCLUDED.roblox_id,
       updated_at = NOW()`,
    [userId, accessToken, scope, robloxId]
  );
}

export async function getAccessToken(userId: number): Promise<string | null> {
  await ensureBigGamesTables();
  const { rows } = await pool.query(
    `SELECT access_token FROM big_games_tokens WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0]?.access_token ?? null;
}

export async function getTokenStatus(userId: number) {
  await ensureBigGamesTables();
  const { rows } = await pool.query(
    `SELECT access_token, scope, roblox_id, updated_at
     FROM big_games_tokens WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  return {
    connected: true,
    robloxId: rows[0].roblox_id ?? null,
    scope: rows[0].scope ?? "",
    updatedAt: rows[0].updated_at instanceof Date ? rows[0].updated_at.toISOString() : String(rows[0].updated_at),
  };
}

export async function deleteAccessToken(userId: number) {
  await ensureBigGamesTables();
  await pool.query(`DELETE FROM big_games_tokens WHERE user_id = $1`, [userId]);
}

// ---------------------------------------------------------------------------
// Token validation — detect revokes / expired tokens.
// ---------------------------------------------------------------------------

// Calls the BIG Games API with the stored token to confirm it is still valid.
// BIG Games returns 401 when the user has revoked the app or the token has
// expired (they last 30 days with no refresh). We must not trust the local
// `big_games_tokens` row alone, otherwise someone who revokes the app (or whose
// token lapses) keeps passing the application gate.
//
// Conservative on 5xx / network errors: we return `valid: true` so a transient
// BIG Games outage never falsely locks a legitimately-connected user out.
export async function validateBigGamesToken(
  accessToken: string
): Promise<{ valid: boolean; status?: number; reason?: string }> {
  if (!accessToken) return { valid: false, reason: "no_token" };
  try {
    const res = await fetch(`${BIG_GAMES_API}/v1/account/profile`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) return { valid: true, status: res.status };
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: res.status, reason: "unauthorized" };
    }
    // 5xx or anything unexpected — do not false-lock.
    return { valid: true, status: res.status, reason: "unexpected_status" };
  } catch (err) {
    // Network timeout / DNS failure — assume the stored token is still fine.
    return { valid: true, reason: "unreachable" };
  }
}

// Like getTokenStatus, but verifies the token against BIG Games first. If the
// token is revoked/expired it clears the stale row and returns null, so the
// site gate and the profile UI treat the user as "not connected".
export async function getValidatedTokenStatus(userId: number) {
  await ensureBigGamesTables();
  const { rows } = await pool.query(
    `SELECT access_token, scope, roblox_id, updated_at
     FROM big_games_tokens WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;

  const check = await validateBigGamesToken(rows[0].access_token);
  if (!check.valid) {
    await pool.query(`DELETE FROM big_games_tokens WHERE user_id = $1`, [userId]);
    return null;
  }

  return {
    connected: true,
    robloxId: rows[0].roblox_id ?? null,
    scope: rows[0].scope ?? "",
    updatedAt: rows[0].updated_at instanceof Date ? rows[0].updated_at.toISOString() : String(rows[0].updated_at),
  };
}

// ---------------------------------------------------------------------------
// Exchange an authorization code for an access token (server-side).
// ---------------------------------------------------------------------------

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const clientId = process.env.BIG_GAMES_CLIENT_ID!;
  const clientSecret = process.env.BIG_GAMES_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(BIG_GAMES_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`BIG Games token exchange failed: ${msg}`);
  }

  return {
    accessToken: String(json.access_token ?? ""),
    expiresIn: Number(json.expires_in ?? 0),
    scope: String(json.scope ?? ""),
  };
}
