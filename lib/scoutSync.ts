// Server-side resync engine for the Enemy Intel scout page.
// Chunked, checkpointed phases so a sync survives serverless time limits —
// each HTTP pass works until its budget runs out, saves, and the client re-fires.

import { pool } from "@/lib/db";
import {
  buildSummary,
  type EnchantRow,
  type ScoutRow,
  type ScoutSummary,
} from "@/lib/scoutAnalysis";

const PS99 = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const ROBLOX_USERS = "https://users.roblox.com/v1/users";
const STATE_ID = "latest";
const UA = { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" };

export type ScoutPhase = "standings" | "usernames" | "directory" | "inventory" | "summary" | "done";

export type ScoutBattle = {
  id: string;
  state: string; // "past" | "active" | "unknown"
  startTime: number | null;
  finishTime: number | null;
  participants: number | null;
};

export type ScoutState = {
  version: 1;
  phase: ScoutPhase;
  battle: ScoutBattle | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  progress: Record<string, number>;
  rows: ScoutRow[];
  publicIds: string[];
  dirPage: number;
  matches: string[];
  inventoryDone: string[];
  enchantRows: EnchantRow[];
  summary: ScoutSummary | null;
};

// ---------------------------------------------------------------------------
// JSON narrowing helpers (third-party API payloads)
// ---------------------------------------------------------------------------

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : {};
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

function asNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

let tablesReady: Promise<void> | null = null;

export function ensureScoutTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS scout_sync_state (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

export async function loadScoutState(): Promise<ScoutState | null> {
  await ensureScoutTables();
  const { rows } = await pool.query<{ payload: ScoutState }>(
    `SELECT payload FROM scout_sync_state WHERE id = $1 LIMIT 1`,
    [STATE_ID]
  );
  return rows[0]?.payload ?? null;
}

async function saveScoutState(state: ScoutState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await pool.query(
    `INSERT INTO scout_sync_state (id, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [STATE_ID, JSON.stringify(state)]
  );
}

function freshState(): ScoutState {
  return {
    version: 1,
    phase: "standings",
    battle: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    progress: {},
    rows: [],
    publicIds: [],
    dirPage: 1,
    matches: [],
    inventoryDone: [],
    enchantRows: [],
    summary: null,
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers (429-aware, deadline-respecting)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...UA, ...(init?.headers ?? {}) },
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (res.status === 429) {
        const wait = Math.min(8000, Number(res.headers.get("retry-after") ?? 2) * 1000 + attempt * 1500);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      const body: unknown = await res.json().catch(() => null);
      return body ?? null;
    } catch {
      await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function robloxBatch(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const res = await fetchJson(ROBLOX_USERS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: userIds.map((id) => Number(id)), excludeBannedUsers: false }),
  });
  for (const raw of asArr(asObj(res).data)) {
    const o = asObj(raw);
    const name = asStr(o.name).trim();
    if (o.id && name) names.set(asStr(o.id), name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Pipeline steps — each mutates state
// ---------------------------------------------------------------------------

async function stepStandings(state: ScoutState): Promise<void> {
  const active = await fetchJson(`${PS99}/api/activeClanBattle`);
  const cfg = asObj(asObj(asObj(active).data).configData);
  const battleId = asStr(cfg._id ?? cfg.Title);
  if (!battleId) throw new Error("Could not determine the latest clan battle");

  let battle = await fetchJson(`${PS99}/v1/clans/battles/${encodeURIComponent(battleId)}`);
  if (!battle && cfg.Title && asStr(cfg.Title) !== battleId) {
    battle = await fetchJson(`${PS99}/v1/clans/battles/${encodeURIComponent(asStr(cfg.Title))}`);
  }
  const battleData = asObj(asObj(battle).data);
  const meta = asObj(battleData.meta);
  const topClans = asArr(battleData.topClans)
    .map(asObj)
    .sort((a, b) => asNum(a.rank, 999) - asNum(b.rank, 999))
    .slice(0, 10);
  if (topClans.length === 0) throw new Error(`No standings available for ${battleId}`);

  state.battle = {
    id: battleId,
    state: asStr(meta.state) || "unknown",
    startTime: asNum(meta.startTime ?? cfg.StartTime) || null,
    finishTime: asNum(meta.finishTime ?? cfg.FinishTime) || null,
    participants: asNum(asObj(battleData.stats).participatingClans) || null,
  };

  const rows: ScoutRow[] = [];
  for (const clan of topClans) {
    const name = asStr(clan.name);
    const rank = asNum(clan.rank, 999);
    if (!name) continue;
    const info = await fetchJson(`${PS99}/api/clan/${encodeURIComponent(name)}`);
    const data = asObj(asObj(info).data);
    if (!Object.keys(data).length) continue;

    const target = battleId.toLowerCase();
    let contrib = new Map<string, number>();
    for (const [key, raw] of Object.entries(asObj(data.Battles))) {
      const val = asObj(raw);
      const names = [key, asStr(val.BattleID), asStr(val.Title)].map((n) => n.toLowerCase());
      if (names.includes(target)) {
        contrib = new Map(
          asArr(val.PointContributions).map((pc) => {
            const o = asObj(pc);
            return [asStr(o.UserID), asNum(o.Points)] as const;
          })
        );
        break;
      }
    }

    const ownerId = data.Owner ? asStr(data.Owner) : null;
    if (ownerId) {
      rows.push({
        clanRank: rank, clan: name, userId: ownerId, username: null, role: "Owner",
        warPoints: contrib.get(ownerId) ?? 0, joinDate: "",
      });
    }
    for (const rawM of asArr(data.Members)) {
      const m = asObj(rawM);
      const userId = asStr(m.UserID);
      if (!userId) continue;
      const join = asNum(m.JoinTime);
      rows.push({
        clanRank: rank, clan: name, userId, username: null,
        role: userId === ownerId ? "Owner" : asNum(m.PermissionLevel) >= 90 ? "Officer" : "Member",
        warPoints: contrib.get(userId) ?? 0,
        joinDate: join ? new Date(join * 1000).toISOString().slice(0, 10) : "",
      });
    }
    state.progress = { ...state.progress, clans: (state.progress.clans ?? 0) + 1 };
    await sleep(250);
  }

  state.rows = rows;
  state.publicIds = [];
  state.dirPage = 1;
  state.matches = [];
  state.inventoryDone = [];
  state.enchantRows = [];
  state.summary = null;
  state.phase = "usernames";
}

async function stepUsernames(state: ScoutState, deadline: number): Promise<void> {
  const unique = Array.from(new Set(state.rows.map((r) => r.userId)));
  const resolved = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    if (Date.now() > deadline - 8_000) break; // names are cosmetic — never block the sync
    const batch = await robloxBatch(unique.slice(i, i + 100));
    for (const [id, name] of batch) resolved.set(id, name);
    state.progress = { ...state.progress, named: resolved.size };
    await sleep(300);
  }
  for (const row of state.rows) {
    row.username = resolved.get(row.userId) ?? null;
  }
  state.phase = "directory";
}

async function stepDirectory(state: ScoutState, deadline: number): Promise<void> {
  const set = new Set(state.publicIds);
  const rowById = new Map(state.rows.map((r) => [r.userId, r] as const));
  for (let i = 0; i < 6; i += 1) {
    if (state.dirPage > 60 || Date.now() > deadline - 4_000) {
      state.publicIds = Array.from(set);
      return; // more pages to chew next pass (or hard cap hit)
    }
    const url = `${PS99}/v1/players?page=${state.dirPage}&pageSize=1000&sort=recent&sortOrder=desc`;
    const data = await fetchJson(url);
    if (!data) throw new Error("Public player directory fetch failed");
    const batch = asArr(asObj(data).data);
    for (const raw of batch) {
      const p = asObj(raw);
      const id = asStr(p.robloxUserId);
      if (!id) continue;
      set.add(id);
      const row = rowById.get(id);
      if (row && !row.username && typeof p.username === "string") row.username = p.username;
    }
    state.dirPage += 1;
    if (batch.length < 1000) {
      // Directory exhausted — build the match list and move on.
      state.publicIds = Array.from(set);
      state.matches = Array.from(new Set(state.rows.map((r) => r.userId).filter((id) => set.has(id))));
      state.progress = { ...state.progress, matched: state.matches.length, dirPages: state.dirPage - 1 };
      state.phase = state.matches.length ? "inventory" : "summary";
      return;
    }
    await sleep(250);
  }
  state.publicIds = Array.from(set);
}

async function stepInventoryChunk(state: ScoutState, deadline: number): Promise<boolean> {
  const done = new Set(state.inventoryDone);
  const pending = state.matches.filter((id) => !done.has(id));
  const chunk = pending.slice(0, 12);
  const byUser = new Map(state.rows.map((r) => [r.userId, r] as const));

  const results = await Promise.all(
    chunk.map(async (userId) => {
      const row = byUser.get(userId);
      if (!row) return null;
      const player = await fetchJson(`${PS99}/v1/players/${encodeURIComponent(userId)}?include=inventory`);
      const inv = asObj(asObj(asObj(asObj(player).data).views).inventory);
      const available = inv.available === true;
      const ench = asObj(asObj(asObj(asObj(inv).data).equipped).enchants);
      const list = available ? asArr(ench.list) : [];
      const names = list
        .map((e) => {
          const o = asObj(e);
          return asStr(o.displayName ?? o.id).trim();
        })
        .filter((n) => n.length > 0);
      return {
        clanRank: row.clanRank, clan: row.clan, userId,
        username: row.username, warPoints: row.warPoints,
        inventoryPublic: available,
        maxEnchants: available ? asNum(ench.maxEnchants) || null : null,
        enchantNames: available ? names : [],
      } satisfies EnchantRow;
    })
  );

  for (const r of results) {
    if (r) state.enchantRows.push(r);
  }
  state.inventoryDone.push(...chunk);
  state.progress = { ...state.progress, enchDone: state.inventoryDone.length, enchTotal: state.matches.length };
  if (deadline - Date.now() < 2_000) return false;
  return state.inventoryDone.length >= state.matches.length;
}

// ---------------------------------------------------------------------------
// Public entry: work the pipeline until done or the budget runs out.
// ---------------------------------------------------------------------------

export async function runScoutPass(opts: { budgetMs: number; restart?: boolean }): Promise<{ state: ScoutState; done: boolean }> {
  await ensureScoutTables();
  const state = opts.restart ? freshState() : ((await loadScoutState()) ?? freshState());
  if (state.phase === "done" && !opts.restart) return { state, done: true };
  if (opts.restart) {
    state.error = null;
  }

  const deadline = Date.now() + opts.budgetMs;
  try {
    while (Date.now() < deadline && state.phase !== "done") {
      if (state.phase === "standings") {
        await stepStandings(state);
      } else if (state.phase === "usernames") {
        await stepUsernames(state, deadline);
      } else if (state.phase === "directory") {
        await stepDirectory(state, deadline);
      } else if (state.phase === "inventory") {
        const finished = await stepInventoryChunk(state, deadline);
        if (finished) state.phase = "summary";
      } else if (state.phase === "summary") {
        state.summary = buildSummary(state.rows, state.enchantRows);
        state.finishedAt = new Date().toISOString();
        state.phase = "done";
        break;
      }
    }
  } catch (err) {
    state.error = err instanceof Error ? err.message : "sync_failed";
  }

  await saveScoutState(state);
  return { state, done: state.phase === "done" };
}
