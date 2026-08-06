// Pure inbox helpers — shared by the notifications page, unit-tested by
// scripts/test-inbox.mjs. No React, no Next — ordering logic lives here so
// it can never silently rot inside JSX.
//
// Canonical ordering: `id` DESC. ids are BIGSERIAL, so id order == time
// order, and unlike createdAt strings it can never tie or mis-parse.

export type HubNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  imageUrl: string | null;
  createdAt: string;
};

export type FilterId = "all" | "unread" | "war" | "broadcast" | "presence";

export type DayGroup = { label: string; rows: HubNotification[] };

// ---------------------------------------------------------------------------
// Per-type personality: icon, chip label + colours, icon tile, unread glow.
// Class strings stay literal so Tailwind keeps them.
// ---------------------------------------------------------------------------

export const TYPE_META: Record<
  string,
  { icon: string; label: string; chip: string; iconTile: string; glow: string }
> = {
  war: {
    icon: "⚔️",
    label: "War",
    chip: "border-rose-400/30 bg-rose-400/10 text-rose-200",
    iconTile: "border-rose-400/30 bg-rose-500/15",
    glow: "shadow-[0_0_28px_rgba(251,113,133,0.14)]",
  },
  broadcast: {
    icon: "📢",
    label: "Broadcast",
    chip: "border-violet-400/30 bg-violet-400/10 text-violet-200",
    iconTile: "border-violet-400/30 bg-violet-500/15",
    glow: "shadow-[0_0_28px_rgba(167,139,250,0.14)]",
  },
  presence: {
    icon: "🎮",
    label: "Nudge",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    iconTile: "border-emerald-400/30 bg-emerald-500/15",
    glow: "shadow-[0_0_28px_rgba(52,211,153,0.12)]",
  },
  test: {
    icon: "🔔",
    label: "Test",
    chip: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    iconTile: "border-sky-400/30 bg-sky-500/15",
    glow: "shadow-[0_0_28px_rgba(56,189,248,0.10)]",
  },
};

const FALLBACK_META = {
  icon: "🔔",
  label: "Alert",
  chip: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
  iconTile: "border-white/10 bg-black/40",
  glow: "",
};

export function metaFor(type: string) {
  return TYPE_META[type] ?? FALLBACK_META;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function relTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function dayLabelOf(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(new Date());
  const thatDay = startOf(date);
  if (thatDay === today) return "Today";
  if (thatDay === today - 86_400_000) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Hero CTA — the row stores the REAL destination page, so label it properly.
// ---------------------------------------------------------------------------

export function ctaFor(url: string | null): { href: string; label: string } | null {
  if (!url || url.startsWith("/notifications")) return null;
  if (url.startsWith("/war")) return { href: url, label: "⚔️ Open War Room" };
  if (url.startsWith("/leaderboard")) return { href: url, label: "🏆 Open Leaderboard" };
  if (url.startsWith("/dashboard")) return { href: url, label: "📊 Open Dashboard" };
  if (url.startsWith("/settings")) return { href: url, label: "⚙️ Open Settings" };
  return { href: url, label: "Open page →" };
}

// ---------------------------------------------------------------------------
// Ordering — the bit that MUST be correct.
// ---------------------------------------------------------------------------

export function byRecency(a: HubNotification, b: HubNotification) {
  return b.id - a.id;
}

export function sortByRecency(list: HubNotification[]): HubNotification[] {
  return [...list].sort(byRecency);
}

// Deep-linked alerts arrive out-of-band (single fetch): dedupe, then place
// by id so an OLD tapped alert lands in its date group — never on top.
export function insertByRecency(
  list: HubNotification[],
  item: HubNotification
): HubNotification[] {
  if (list.some((existing) => existing.id === item.id)) return list;
  const next = [...list, item];
  next.sort(byRecency);
  return next;
}

// Groups alerts into Today / Yesterday / date buckets. Robust to ANY input
// order: buckets are ordered by their newest member, rows sorted inside.
export function groupByDay(items: HubNotification[]): DayGroup[] {
  const byLabel = new Map<string, HubNotification[]>();
  for (const item of items) {
    const label = dayLabelOf(item.createdAt);
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(item);
    else byLabel.set(label, [item]);
  }
  return Array.from(byLabel, ([label, rows]) => ({ label, rows: sortByRecency(rows) })).sort(
    (a, b) => byRecency(a.rows[0], b.rows[0])
  );
}
