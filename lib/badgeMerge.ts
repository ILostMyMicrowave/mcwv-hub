/**
 * Badge merge core (pure, no I/O).
 *
 * Storage model:
 *   user_profile_styles.badges       = MATERIALIZED display array (what cards show)
 *   user_profile_styles.auto_badges  = the auto subset pinned by Discord-role links
 *   manual subset                    = badges − auto_badges (officer pins)
 *
 * Display order: officer-chosen manual pins first (their order), then
 * auto badges sorted by preset sort_order. Everything deduped, capped.
 */

export const BADGE_CAP = 8;

export function parseBadgeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .slice(0, BADGE_CAP * 4);
}

export function mergeDisplayBadges(
  manual: string[],
  auto: string[],
  orderOf: (key: string) => number,
  cap: number = BADGE_CAP
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of manual) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (out.length < cap) out.push(key);
  }

  const sortedAuto = [...new Set(auto.map((k) => k.trim()).filter(Boolean))].sort(
    (a, b) => {
      const diff = orderOf(a) - orderOf(b);
      return diff !== 0 ? diff : a.localeCompare(b);
    }
  );

  for (const key of sortedAuto) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (out.length < cap) out.push(key);
  }

  return out;
}

export function countBadgeDiff(previous: string[], next: string[]) {
  return {
    added: next.filter((key) => !previous.includes(key)).length,
    removed: previous.filter((key) => !next.includes(key)).length,
  };
}

/** manual subset = display badges minus the auto-managed ones */
export function manualSubset(badges: string[], autoBadges: string[]): string[] {
  return badges.filter((key) => !autoBadges.includes(key));
}

/**
 * Tier collapse for role-linked badges.
 *
 * Of the EXCLUSIVE-tier badges a member qualifies for, only the one(s) with
 * the highest Discord role position survive — Owner hides Head Officer hides
 * Officer, etc. Non-tier badges (OG, Donator, ...) are never touched.
 *
 * positionOf returns the Discord role position (higher = higher in the server
 * role list) or null when the role isn't in the catalogue. If NO tier badge
 * has a known position, nothing is collapsed (safe default: show all).
 */
export function collapseExclusiveTiers<
  T extends { key: string; exclusive: boolean; roleId: string }
>(
  qualifying: readonly T[],
  positionOf: (roleId: string) => number | null
): T[] {
  const flagged = qualifying.filter((badge) => badge.exclusive);
  if (flagged.length <= 1) return [...qualifying];

  let bestPosition = Number.NEGATIVE_INFINITY;
  for (const badge of flagged) {
    const position = positionOf(badge.roleId);
    if (position !== null && position > bestPosition) bestPosition = position;
  }
  if (bestPosition === Number.NEGATIVE_INFINITY) return [...qualifying];

  const winners = new Set(
    flagged
      .filter((badge) => (positionOf(badge.roleId) ?? Number.NEGATIVE_INFINITY) === bestPosition)
      .map((badge) => badge.key)
  );
  return qualifying.filter((badge) => !badge.exclusive || winners.has(badge.key));
}
