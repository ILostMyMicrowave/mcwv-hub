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
