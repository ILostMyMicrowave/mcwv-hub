import crypto from "crypto";
import { pool } from "@/lib/db";

// Staff-only Discord OAuth snapshot (identify + guilds).
// Officers start a check from the bot; the applicant opens a 15-minute
// one-shot link. We NEVER store the OAuth token or the full guild list —
// only denylist hits (id + display name) plus a guild count.

export const DISCORD_API = "https://discord.com/api/v10";
export const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
export const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
export const DISCORD_REVOKE_URL = "https://discord.com/api/oauth2/token/revoke";
export const DISCORD_GUILD_SCOPES = "identify guilds";

export function discordOAuthConfigured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

export function discordGuildsRedirectUri() {
  return (
    process.env.DISCORD_GUILDS_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app"}/api/discord/guilds/callback`
  );
}

export function generateOAuthState() {
  return crypto.randomBytes(24).toString("base64url");
}

export type DenylistEntry = { id: string; name: string };
export type FlaggedHit = { id: string; name: string };

export type GuildCheckRow = {
  token: string;
  target_discord_id: string;
  ticket_id: string | null;
  requested_by: string;
  status: string;
  flagged_hits: FlaggedHit[];
  guild_count: number | null;
  identified_discord_id: string | null;
  oauth_state: string | null;
  expires_at: Date;
};

async function ensureGuildCheckTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_guild_checks (
      token TEXT PRIMARY KEY,
      target_discord_id TEXT NOT NULL,
      ticket_id TEXT,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      flagged_hits JSONB NOT NULL DEFAULT '[]'::jsonb,
      guild_count INTEGER,
      identified_discord_id TEXT,
      oauth_state TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS discord_guild_checks_target_idx
    ON discord_guild_checks (target_discord_id, status)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS discord_guild_checks_oauth_state_idx
    ON discord_guild_checks (oauth_state)
    WHERE oauth_state IS NOT NULL
  `);
}

function parseFlaggedHits(raw: unknown): FlaggedHit[] {
  if (!Array.isArray(raw)) return [];
  const out: FlaggedHit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: unknown }).id ?? "").trim();
    const name = String((item as { name?: unknown }).name ?? "").trim();
    if (!id) continue;
    out.push({ id, name: name || id });
  }
  return out;
}

function mapCheckRow(row: Record<string, unknown>): GuildCheckRow {
  return {
    token: String(row.token),
    target_discord_id: String(row.target_discord_id),
    ticket_id: row.ticket_id != null ? String(row.ticket_id) : null,
    requested_by: String(row.requested_by ?? ""),
    status: String(row.status ?? "pending"),
    flagged_hits: parseFlaggedHits(row.flagged_hits),
    guild_count: row.guild_count == null ? null : Number(row.guild_count),
    identified_discord_id: row.identified_discord_id != null ? String(row.identified_discord_id) : null,
    oauth_state: row.oauth_state != null ? String(row.oauth_state) : null,
    expires_at: row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at)),
  };
}

export async function getCheckByToken(token: string): Promise<GuildCheckRow | null> {
  await ensureGuildCheckTables();
  const { rows } = await pool.query(
    `SELECT token, target_discord_id, ticket_id, requested_by, status, flagged_hits,
            guild_count, identified_discord_id, oauth_state, expires_at
     FROM discord_guild_checks WHERE token = $1 LIMIT 1`,
    [token]
  );
  return rows[0] ? mapCheckRow(rows[0]) : null;
}

export async function getCheckByOAuthState(state: string): Promise<GuildCheckRow | null> {
  await ensureGuildCheckTables();
  const { rows } = await pool.query(
    `SELECT token, target_discord_id, ticket_id, requested_by, status, flagged_hits,
            guild_count, identified_discord_id, oauth_state, expires_at
     FROM discord_guild_checks WHERE oauth_state = $1 LIMIT 1`,
    [state]
  );
  return rows[0] ? mapCheckRow(rows[0]) : null;
}

export function isCheckExpired(row: GuildCheckRow) {
  return row.expires_at.getTime() <= Date.now();
}

export async function markCheckExpired(token: string) {
  await pool.query(
    `UPDATE discord_guild_checks
     SET status = 'expired', completed_at = NOW(), oauth_state = NULL
     WHERE token = $1 AND status = 'pending'`,
    [token]
  );
}

export async function attachOAuthState(token: string, state: string) {
  await pool.query(
    `UPDATE discord_guild_checks
     SET oauth_state = $2
     WHERE token = $1 AND status = 'pending'`,
    [token, state]
  );
}

export async function completeCheck(
  token: string,
  status: "clean" | "flagged" | "declined" | "mismatch" | "error",
  opts: {
    flaggedHits?: FlaggedHit[];
    guildCount?: number | null;
    identifiedDiscordId?: string | null;
  } = {}
) {
  await pool.query(
    `UPDATE discord_guild_checks
     SET status = $2,
         flagged_hits = $3::jsonb,
         guild_count = $4,
         identified_discord_id = $5,
         completed_at = NOW(),
         oauth_state = NULL
     WHERE token = $1 AND status = 'pending'`,
    [
      token,
      status,
      JSON.stringify(opts.flaggedHits ?? []),
      opts.guildCount ?? null,
      opts.identifiedDiscordId ?? null,
    ]
  );
}

export async function getCheckDenylist(): Promise<DenylistEntry[]> {
  const { rows } = await pool.query(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    ["mcwv_check_denylist"]
  );
  const raw = rows[0]?.value;
  let parsed: unknown = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: DenylistEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: unknown }).id ?? "").trim();
    const name = String((item as { name?: unknown }).name ?? "").trim().slice(0, 100);
    if (!/^\d{15,25}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: name || id });
  }
  return out;
}

export function intersectDenylist(
  guilds: Array<{ id?: unknown; name?: unknown }>,
  denylist: DenylistEntry[]
): FlaggedHit[] {
  if (!denylist.length) return [];
  const byId = new Map(denylist.map((d) => [d.id, d]));
  const hits: FlaggedHit[] = [];
  const seen = new Set<string>();
  for (const g of guilds) {
    const id = String(g?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    const listed = byId.get(id);
    if (!listed) continue;
    seen.add(id);
    hits.push({ id, name: listed.name || String(g?.name ?? id) });
  }
  return hits;
}

export async function exchangeDiscordCode(code: string, redirectUri: string) {
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!res.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`Discord token exchange failed: ${msg}`);
  }
  return String(json.access_token);
}

export async function revokeDiscordToken(accessToken: string) {
  try {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || "",
      client_secret: process.env.DISCORD_CLIENT_SECRET || "",
      token: accessToken,
      token_type_hint: "access_token",
    });
    await fetch(DISCORD_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch {
    // Best-effort. Token is never stored either way.
  }
}

export async function fetchDiscordIdentity(accessToken: string) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Discord identify failed: HTTP ${res.status}`);
  const json = (await res.json()) as { id?: string };
  const id = String(json?.id ?? "").trim();
  if (!/^\d{15,25}$/.test(id)) throw new Error("Discord identify returned no user id");
  return { id };
}

export async function fetchDiscordGuilds(accessToken: string) {
  const guilds: Array<{ id: string; name: string }> = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${DISCORD_API}/users/@me/guilds`);
    url.searchParams.set("limit", "200");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Discord guilds failed: HTTP ${res.status}`);
    const batch = (await res.json()) as Array<{ id?: unknown; name?: unknown }>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const g of batch) {
      const id = String(g?.id ?? "").trim();
      if (!id) continue;
      guilds.push({ id, name: String(g?.name ?? id) });
    }
    if (batch.length < 200) break;
    after = String(batch[batch.length - 1]?.id ?? "");
    if (!after) break;
  }
  return guilds;
}

export function checkDoneRedirect(message: string, isError: boolean) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://mcwv-hub.vercel.app";
  const url = new URL("/check-done", base);
  url.searchParams.set(isError ? "error" : "ok", message);
  return url.toString();
}
