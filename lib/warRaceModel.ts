// ─────────────────────────────────────────────────────────────────────────────
// War Analyst "race model" view - same engine as the bot's /threatboard.
//
// The bot recomputes its race model every 5 minutes (EWMA pace on 5-min ticks,
// Monte-Carlo flip odds, whole-field rank DP, what-it-takes ladder) and upserts
// the JSONB result into war_projection_cache. This module validates that payload
// and turns it into the small view model the war-analyst page renders. All pure:
// no network, no DB, no React - so every formula here is unit-testable against
// numbers exported from the bot's own Python functions (see work/war-analyst).
//
// Design rules:
//   - never throw: bad/missing payloads collapse to null and the page shows its
//     legacy view, exactly as before this feature existed;
//   - the deterministic lane (gap/net/eta/required/verdict) is recomputed here
//     for the what-if slider using the bot's exact closed forms, so boost 0
//     reproduces the payload numbers bit-for-bit (asserted in tests);
//   - Monte-Carlo probabilities are never faked client-side: what-if only moves
//     deterministic numbers and the UI labels it so.
// ─────────────────────────────────────────────────────────────────────────────

export type RaceModelLanePoint = [number, number]; // [epoch s, cumulative points]

export type RaceModelRace = {
  clan: string;
  rank: number | null;
  level: number;
  gap: number; // >0: we are ahead
  netRate: number | null; // pts/h (ours - theirs)
  ourRate: number | null;
  theirRate: number | null;
  rate1h: number | null;
  windowH: number;
  verdict: string;
  etaDetH: number | null;
  flipProb: number | null;
  flipDir: string | null;
  etaMedH: number | null;
  etaP25H: number | null;
  etaP75H: number | null;
  requiredPph: number | null;
  confidence: string;
  signals: string;
  paceSrc: string;
};

export type RaceModelView = {
  status: "ok" | "stale";
  ageSeconds: number;
  computedAt: string;
  battleId: string;
  battle: string | null;
  hoursLeft: number | null;
  headline: string | null;
  us: { rank: number | null; level: number | null; rate: number | null; rate1h: number | null; window: number | null };
  races: RaceModelRace[];
  whatItTakes: string[];
  probs: { top5?: number; top10?: number; top15?: number; top20?: number };
  probsSrc: string | null;
  final: { p10: number | null; p50: number | null; p90: number | null; medRank: number | null };
  notes: string[];
};

export const RACE_MODEL_FRESH_MS = 25 * 60 * 1000;
export const RACE_MODEL_MAX_AGE_MS = 48 * 3600 * 1000;

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function intNum(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

function str(value: unknown, maxLen = 120): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function battleKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── bot-formula mirrors (keep in sync with _race_assemble/_race_verdict) ──────

/** Mirrors the bot's _race_verdict. gap > 0 means we are ahead. */
export function raceVerdict(gap: number, net: number | null): string {
  if (gap > 0) {
    if (net === null) return "HOLDING";
    if (net < 0) return "THREAT: CLOSING";
    if (net > 0) return "PULLING AWAY";
    return "HOLDING";
  }
  if (net === null) return "BEHIND";
  if (net > 0) return "HUNTING";
  return "BEHIND";
}

/**
 * Deterministic-lane re-solve for the what-if slider. With boostPph = 0 this
 * reproduces the payload exactly; with a boost it moves OUR pace up by that
 * many pts/h and re-derives net/flip-ETA/required/verdict with the bot's
 * closed forms:
 *   eta: gap>0 & net<0 -> gap/-net ; gap<0 & net>0 -> -gap/net
 *   required: trailing -> |gap|/H - net ; leading -> -gap/H - net (clamped >=0)
 */
export function raceWhatIf(
  race: Pick<RaceModelRace, "gap" | "ourRate" | "theirRate">,
  boostPph: number,
  hoursLeft: number | null
): { net: number | null; etaDetH: number | null; requiredPph: number | null; verdict: string } {
  const gap = race.gap;
  const net =
    race.ourRate !== null && race.theirRate !== null && Number.isFinite(boostPph)
      ? race.ourRate + boostPph - race.theirRate
      : null;
  let etaDetH: number | null = null;
  if (net !== null && Math.abs(net) > 1e-9) {
    if (gap > 0 && net < 0) etaDetH = gap / -net;
    else if (gap < 0 && net > 0) etaDetH = -gap / net;
  }
  let requiredPph: number | null = null;
  if (net !== null && hoursLeft !== null && hoursLeft > 0) {
    requiredPph = gap < 0 ? Math.max(0, Math.abs(gap) / hoursLeft - net) : Math.max(0, -gap / hoursLeft - net);
  }
  return { net, etaDetH, requiredPph, verdict: raceVerdict(gap, net) };
}

/** Bot _race_fmt_pts: B (2dp) / M (1dp) / plain integer. No thousands separators. */
export function fmtRacePts(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "?";
  const v = value;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return `${Math.round(v)}`;
}

/** Bot _race_fmt_pph: B (2dp) / M (0dp) / K (0dp) / plain integer. */
export function fmtRacePph(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "?";
  const v = value;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${Math.round(v / 1e6)}M`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}K`;
  return `${Math.round(v)}`;
}

// ── payload validation ───────────────────────────────────────────────────────

function normalizeRaceRow(raw: Record<string, unknown>): RaceModelRace | null {
  const clan = str(raw.clan, 40);
  const level = num(raw.level);
  if (!clan || level === null) return null;
  const flipProb = num(raw.flip_prob);
  return {
    clan,
    rank: intNum(raw.rank),
    level,
    gap: num(raw.gap) ?? 0,
    netRate: num(raw.net_rate),
    ourRate: num(raw.our_rate),
    theirRate: num(raw.their_rate),
    rate1h: num(raw.rate_1h),
    windowH: num(raw.window_h) ?? 0,
    verdict: str(raw.verdict, 40) ?? "BEHIND",
    etaDetH: num(raw.eta_det_h),
    flipProb: flipProb === null ? null : Math.max(0, Math.min(1, flipProb)),
    flipDir: str(raw.flip_dir, 24),
    etaMedH: num(raw.eta_med_h),
    etaP25H: num(raw.eta_p25_h),
    etaP75H: num(raw.eta_p75_h),
    requiredPph: num(raw.required_pph),
    confidence: str(raw.confidence, 24)?.toUpperCase() ?? "LOW",
    signals: str(raw.signals, 160) ?? "",
    paceSrc: str(raw.pace_src, 24) ?? "",
  };
}

/**
 * Validate + normalize the bot's cached payload. Returns null when the payload
 * is unusable (wrong battle, garbage, too old beyond the ceiling) so callers
 * degrade to the legacy view. status "stale" = still shown, with an age badge.
 */
export function parseRacePayload(
  raw: unknown,
  opts: { activeBattleKey: string | null; computedAt: Date | string | null; nowMs?: number }
): RaceModelView | null {
  try {
    let payload: unknown = raw;
    if (typeof payload === "string") {
      payload = JSON.parse(payload); // some pg configs hand JSONB back as text
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const p = payload as Record<string, unknown>;

    const battleId = str(p.battle_id, 80) ?? "";
    const key = battleKey(battleId);
    if (!key) return null;
    if (opts.activeBattleKey && opts.activeBattleKey !== key) return null; // different war

    const racesRaw = p.races;
    if (!Array.isArray(racesRaw)) return null;
    const races: RaceModelRace[] = [];
    for (const row of racesRaw.slice(0, 40)) {
      if (!row || typeof row !== "object") continue;
      const r = normalizeRaceRow(row as Record<string, unknown>);
      if (r) races.push(r);
    }
    if (!races.length) return null;

    const computedAt = opts.computedAt instanceof Date ? opts.computedAt : opts.computedAt ? new Date(opts.computedAt) : null;
    if (!computedAt || Number.isNaN(computedAt.getTime())) return null;
    const nowMs = opts.nowMs ?? Date.now();
    const ageMs = nowMs - computedAt.getTime();
    if (ageMs < 0 || ageMs > RACE_MODEL_MAX_AGE_MS) return null;

    const usRaw = (p.us ?? {}) as Record<string, unknown>;
    const finalRaw = (p.final ?? {}) as Record<string, unknown>;
    const probsRaw = (p.probs ?? {}) as Record<string, unknown>;
    const probs: RaceModelView["probs"] = {};
    for (const k of ["top5", "top10", "top15", "top20"] as const) {
      const v = num(probsRaw[k]);
      if (v !== null && v >= 0 && v <= 1) probs[k] = v;
    }
    const wit = Array.isArray(p.what_it_takes)
      ? (p.what_it_takes as unknown[]).map((line) => str(line, 400)).filter((x): x is string => !!x)
      : [];
    const notes = Array.isArray(p.notes)
      ? (p.notes as unknown[]).map((line) => str(line, 300)).filter((x): x is string => !!x)
      : [];
    const hoursLeft = num(p.hours_left);
    if (hoursLeft !== null && hoursLeft <= 0) return null; // war over: cache stops, page goes legacy

    return {
      status: ageMs <= RACE_MODEL_FRESH_MS ? "ok" : "stale",
      ageSeconds: Math.round(ageMs / 1000),
      computedAt: computedAt.toISOString(),
      battleId,
      battle: str(p.battle, 120),
      hoursLeft,
      headline: str(p.headline, 500),
      us: {
        rank: intNum(usRaw.rank),
        level: num(usRaw.level),
        rate: num(usRaw.rate),
        rate1h: num(usRaw.rate_1h),
        window: num(usRaw.window),
      },
      races,
      whatItTakes: wit,
      probs,
      probsSrc: str(p.probs_src, 12),
      final: {
        p10: num(finalRaw.p10),
        p50: num(finalRaw.p50),
        p90: num(finalRaw.p90),
        medRank: intNum(finalRaw.med_rank),
      },
      notes,
    };
  } catch {
    return null;
  }
}

// ── tick lanes (sparklines) ──────────────────────────────────────────────────

/**
 * war_clan_ticks rows -> per-clan downsampled cumulative-point lanes.
 * rows must arrive ordered by (clan_key, captured_at). Keeps at most maxPts
 * per lane, always including the newest point. Negative gains between kept
 * points (PS99 corrections) are tolerated; lanes shorter than 2 points drop.
 */
export function buildSparkLanes(
  rows: Array<{ clan_key: string | null; ts: number | string | null; points: number | string | null }>,
  opts?: { maxPts?: number }
): Record<string, RaceModelLanePoint[]> {
  const maxPts = opts?.maxPts ?? 40;
  const byKey = new Map<string, RaceModelLanePoint[]>();
  for (const row of rows) {
    const key = str(row.clan_key, 32)?.toLowerCase();
    const ts = num(row.ts);
    const pts = num(row.points);
    if (!key || ts === null || pts === null) continue;
    const lane = byKey.get(key);
    if (!lane) byKey.set(key, [[ts, pts]]);
    else {
      const last = lane[lane.length - 1];
      if (ts === last[0]) last[1] = pts; // same bucket: latest wins
      else lane.push([ts, pts]);
    }
  }
  const out: Record<string, RaceModelLanePoint[]> = {};
  for (const [key, lane] of byKey.entries()) {
    if (lane.length < 2) continue;
    lane.sort((a, b) => a[0] - b[0]);
    if (lane.length <= maxPts) {
      out[key] = lane;
      continue;
    }
    const stride = (lane.length - 1) / (maxPts - 1);
    const kept: RaceModelLanePoint[] = [];
    for (let i = 0; i < maxPts; i++) kept.push(lane[Math.round(i * stride)]);
    if (kept[kept.length - 1] !== lane[lane.length - 1]) kept.push(lane[lane.length - 1]);
    out[key] = kept;
  }
  return out;
}

/**
 * Divergence between the bot model's pace and the legacy collector pace.
 * Returns null when either is unusable; percentages > threshold mean the two
 * engines disagree (usually early-war data quality, worth surfacing).
 */
export function paceDivergencePct(modelPph: number | null, legacyPph: number | null): number | null {
  if (modelPph === null || legacyPph === null) return null;
  if (!Number.isFinite(modelPph) || !Number.isFinite(legacyPph) || legacyPph <= 0 || modelPph <= 0) return null;
  return Math.round((Math.abs(modelPph - legacyPph) / legacyPph) * 100);
}

/**
 * Flip probability display band, mirroring the bot's embed rule: MC odds are
 * only asserted when >= 20% (below that the bot says "no flip at current
 * pace"); anything else shows the deterministic ETA as "pace flip".
 */
export function flipDisplay(race: RaceModelRace): { label: string; pct: number | null } {
  const pct = race.flipProb !== null && race.flipProb >= 0.2 ? Math.round(race.flipProb * 100) : null;
  if (pct !== null && race.etaMedH !== null) {
    const range = race.etaP25H !== null && race.etaP75H !== null ? ` (${race.etaP25H.toFixed(1)}-${race.etaP75H.toFixed(1)}h)` : "";
    return { label: `flip ~${race.etaMedH.toFixed(1)}h${range} @ ${pct}%`, pct };
  }
  if (race.etaDetH !== null) return { label: `pace flip ~${race.etaDetH.toFixed(1)}h`, pct: race.flipProb !== null ? Math.round(race.flipProb * 100) : null };
  return { label: "no flip at current pace", pct: race.flipProb !== null ? Math.round(race.flipProb * 100) : null };
}

/** Direction of the projected flip for tone selection. */
export function flipTone(race: RaceModelRace): "bad" | "good" | "neutral" {
  if ((race.flipProb ?? 0) >= 0.2 && race.flipDir === "they_pass_us") return "bad";
  if ((race.flipProb ?? 0) >= 0.2 && race.flipDir === "we_pass_them") return "good";
  return "neutral";
}

// ── per-battle reward ladder (parsed from PS99 battle meta.placementRewards) ─
// Fully data-driven so it adapts to every clan battle; unknown shape -> null
// and the UI hides the ladder entirely. No hard-coded game facts here except
// MEDAL_BANDS, the PS99 clan-war system medals (constant across battles:
// Gold #1, Silver #2-8, Bronze #9-20; if a future battle overrides them the
// payload wins because tiers come from the API).

export type RewardItem = {
  name: string;
  collection: string;
  amount: number;
};

export type RewardTier = {
  label: string;
  best: number;
  worst: number;
  items: RewardItem[];
  contributorWindow: string | null;
};

export type RewardBoard = {
  tiers: RewardTier[];
  headline: RewardItem | null;
};

export const MEDAL_BANDS: ReadonlyArray<{ medal: string; best: number; worst: number }> = [
  { medal: "Gold", best: 1, worst: 1 },
  { medal: "Silver", best: 2, worst: 8 },
  { medal: "Bronze", best: 9, worst: 20 },
];

export function medalForRank(rank: number | null | undefined): string | null {
  if (typeof rank !== "number" || !Number.isFinite(rank) || rank < 1) return null;
  const band = MEDAL_BANDS.find((b) => rank >= b.best && rank <= b.worst);
  return band ? `${band.medal} medal` : null;
}

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function asRewardItem(raw: unknown): RewardItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
  if (!id) return null;
  const variant = typeof o.variant === "string" ? o.variant.trim() : "";
  const amount = asInt(o.amount) ?? 1;
  return {
    name: variant && variant !== "regular" ? `${variant} ${id}` : id,
    collection: typeof o.collection === "string" && o.collection ? o.collection : "Reward",
    amount,
  };
}

export function parseRewardTiers(meta: unknown): RewardBoard | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const raw = Array.isArray(m.placementRewards) ? (m.placementRewards as unknown[]) : null;
  if (!raw || raw.length === 0) return null;

  const tiers: RewardTier[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const best = asInt(e.best);
    const worst = asInt(e.worst) ?? best;
    if (best === null || worst === null || worst < best) continue;
    const items = (Array.isArray(e.items) ? (e.items as unknown[]) : [])
      .map(asRewardItem)
      .filter((x): x is RewardItem => !!x);
    if (items.length === 0) continue;
    const label =
      typeof e.placement === "string" && e.placement.trim()
        ? e.placement.trim()
        : best === worst
          ? `${best}st`
          : `${best}-${worst}`;
    const contrib =
      typeof e.contributorPlacement === "string" && e.contributorPlacement.trim()
        ? e.contributorPlacement.trim()
        : null;
    tiers.push({ label, best, worst, items, contributorWindow: contrib });
  }
  if (tiers.length === 0) return null;
  tiers.sort((a, b) => a.best - b.best || a.worst - b.worst);

  const headline = asRewardItem(m.headlineReward ?? null);
  return { tiers, headline };
}

export function tiersForRank(board: RewardBoard | null, rank: number | null | undefined): RewardTier[] {
  if (!board || typeof rank !== "number" || !Number.isFinite(rank) || rank < 1) return [];
  return board.tiers.filter((t) => rank >= t.best && rank <= t.worst);
}

// Deduped, human-readable sum of a set of tiers ("2x Gem + Dog"). Distinct
// items can share a name (the live meta has a "Yee-haw" hoverboard AND a
// "Yee-haw" booth), so on collision we disambiguate with the collection.
export function rewardNames(tiers: RewardTier[]): string {
  const raw: { name: string; collection: string; label: string }[] = [];
  const uniqueNames = new Set<string>();
  for (const t of tiers) {
    for (const i of t.items) {
      const key = `${i.name}|${i.collection}`;
      if (!raw.some((r) => `${r.name}|${r.collection}` === key)) {
        raw.push({ name: i.name, collection: i.collection, label: i.amount > 1 ? `${i.amount}x ${i.name}` : i.name });
      }
    }
  }
  for (const r of raw) uniqueNames.add(r.name);
  const dupes = new Set<string>();
  const counts = new Map<string, number>();
  for (const r of raw) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  for (const [name, n] of counts) if (n > 1) dupes.add(name);
  return raw.map((r) => (dupes.has(r.name) ? `${r.label} (${r.collection})` : r.label)).join(" + ");
}

// Most exclusive item this rank locks in (for compact chips next to odds).
export function primaryRewardName(board: RewardBoard | null, rank: number | null | undefined): string | null {
  const held = tiersForRank(board, rank);
  return held.length ? held[0].items[0]?.name ?? null : null;
}

// Next rung up: the nearest better band edge we can still climb to, and what
// climbing there would ADD to the haul (bands overlap, so e.g. slipping out
// of "1st" still keeps the 1-30 hoverboard).
export function nextLadder(
  board: RewardBoard | null,
  rank: number,
): { targetRank: number; gains: RewardTier[] } | null {
  if (!board) return null;
  const better = board.tiers.filter((t) => t.worst < rank);
  if (better.length === 0) return null;
  const target = better.reduce((a, b) => (b.worst > a.worst ? b : a));
  const targetRank = target.worst;
  const gains = tiersForRank(board, targetRank).filter(
    (t) => !(t.best <= rank && rank <= t.worst),
  );
  return gains.length > 0 ? { targetRank, gains } : null;
}

// What one rank of slip costs: tiers held at `rank` but not at rank + 1.
// gains = consolation tier we fall INTO (may be empty - out of the ladder).
export function slipDelta(
  board: RewardBoard | null,
  rank: number,
): { losses: RewardTier[]; gains: RewardTier[] } | null {
  const now = tiersForRank(board, rank);
  if (now.length === 0) return null;
  const after = tiersForRank(board, rank + 1);
  const losses = now.filter((t) => !after.includes(t));
  const gains = after.filter((t) => !now.includes(t));
  return losses.length > 0 || gains.length > 0 ? { losses, gains } : null;
}
