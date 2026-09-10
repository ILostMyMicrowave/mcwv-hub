/**
 * Shared number display formatting.
 *
 * formatFull    — exact value with en-GB grouping. Use where precision
 *                 matters and there is room (admin tables, scout tables,
 *                 tooltips).
 * formatCompact — exact below 1M, compact notation above
 *                 (5,056,165,361 → "5.06B", 26,186,003 → "26.19M").
 *                 Use in display-constrained spots: hero numbers, stat
 *                 cards, chat/assistant text, HUD, tickers, narrow rows.
 *                 Battle-scale points are in the billions — full
 *                 13-digit strings do not fit in those UIs.
 */

const COMPACT_THRESHOLD = 1_000_000;

// en-US locale on purpose: its compact suffixes ("B"/"M"/"K") match the
// site's existing convention (war-reports chips). en-GB would give "bn"/"m".
// Compact values carry no group separators, so the locale's separator style
// is irrelevant here.
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatFull(value: number): string {
  return Math.round(value).toLocaleString("en-GB");
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "?";
  if (Math.abs(value) < COMPACT_THRESHOLD) return formatFull(value);
  return compactFormatter.format(value);
}
