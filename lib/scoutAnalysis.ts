// Pure analysis for the Enemy Intel scout feature — no I/O, unit-testable.

export type ScoutRow = {
  clanRank: number;
  clan: string;
  userId: string;
  username: string | null;
  role: "Owner" | "Officer" | "Member";
  warPoints: number;
  joinDate: string;
};

export type EnchantRow = {
  clanRank: number;
  clan: string;
  userId: string;
  username: string | null;
  warPoints: number;
  inventoryPublic: boolean;
  maxEnchants: number | null;
  /** Expanded with duplicates — one entry per equipped slot. */
  enchantNames: string[];
};

export type StyleKey = "th-stack" | "eggs-stack" | "eggs-hybrid" | "utility";

export const STYLE_META: Record<StyleKey, { label: string; emoji: string; tip: string }> = {
  "th-stack": {
    label: "Treasure Hunter stack (5+)",
    emoji: "💰",
    tip: "Fill every slot with Treasure Hunter — best average scorer among public rivals.",
  },
  "eggs-stack": {
    label: "Lucky Eggs stack (6+)",
    emoji: "🥚",
    tip: "All-in on Lucky Eggs — the most popular rival setup.",
  },
  "eggs-hybrid": {
    label: "Lucky Eggs hybrid (3-5)",
    emoji: "⚖️",
    tip: "3-5 Lucky Eggs, fill the rest with Shiny Hunter / Super Shiny Hunter / Rainbow Eggs / Super Magnet.",
  },
  utility: {
    label: "Utility / AFK mix",
    emoji: "🛠",
    tip: "Breakers, taps, speeds and one-offs — the wildcard lane.",
  },
};

export type StyleStat = { style: StyleKey; players: number; avgPoints: number; maxPoints: number };
export type EnchantCount = { name: string; count: number };
export type LoadoutChip = { name: string; count: number };
export type ClanStat = {
  clanRank: number;
  clan: string;
  members: number;
  contributors: number;
  publicProfiles: number;
  inventories: number;
};

export type ScoutSummary = {
  totalMembers: number;
  contributors: number;
  publicProfiles: number;
  inventories: number;
  enchantTotal: number;
  enchantCounts: EnchantCount[];
  styleStats: StyleStat[];
  recommendedStyle: StyleKey | null;
  topScorers: Array<Pick<EnchantRow, "clan" | "clanRank" | "username" | "userId" | "warPoints"> & { loadout: LoadoutChip[] }>;
  clanStats: ClanStat[];
};

function countNames(names: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of names) {
    const key = (n || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Classify a loadout into a meta style. Treasure Hunter dominance beats egg counts first. */
export function styleOfLoadout(names: string[]): StyleKey {
  const counts = countNames(names);
  const th = counts.get("Treasure Hunter") ?? 0;
  const eggs = counts.get("Lucky Eggs") ?? 0;
  if (th >= 5) return "th-stack";
  if (eggs >= 6) return "eggs-stack";
  if (eggs >= 3) return "eggs-hybrid";
  return "utility";
}

/** Collapse duplicate enchants into chip form: "Lucky Eggs ×5". */
export function compressLoadout(names: string[]): LoadoutChip[] {
  const counts = countNames(names);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

export function enchantCounts(rows: EnchantRow[]): EnchantCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.inventoryPublic) continue;
    for (const n of row.enchantNames) {
      const key = (n || "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function styleStats(rows: EnchantRow[]): StyleStat[] {
  const buckets = new Map<StyleKey, number[]>();
  for (const row of rows) {
    if (!row.inventoryPublic || row.enchantNames.length === 0) continue;
    const style = styleOfLoadout(row.enchantNames);
    const arr = buckets.get(style) ?? [];
    arr.push(row.warPoints);
    buckets.set(style, arr);
  }
  return Array.from(buckets.entries())
    .map(([style, pts]) => ({
      style,
      players: pts.length,
      avgPoints: pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0,
      maxPoints: pts.length ? Math.max(...pts) : 0,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints);
}

/** Highest-avg scoring style, utility excluded (it's a catch-all, not a recipe). */
export function recommendedStyle(rows: EnchantRow[]): StyleKey | null {
  const stats = styleStats(rows).filter((s) => s.style !== "utility" && s.players > 0);
  return stats.length ? stats[0].style : null;
}

export function topScorers(rows: EnchantRow[], limit = 8): ScoutSummary["topScorers"] {
  return rows
    .filter((r) => r.inventoryPublic && r.enchantNames.length > 0)
    .slice()
    .sort((a, b) => b.warPoints - a.warPoints)
    .slice(0, limit)
    .map((r) => ({
      clan: r.clan,
      clanRank: r.clanRank,
      username: r.username,
      userId: r.userId,
      warPoints: r.warPoints,
      loadout: compressLoadout(r.enchantNames),
    }));
}

export function clanStats(rows: ScoutRow[], enchantRows: EnchantRow[]): ClanStat[] {
  const byKey = new Map<string, ClanStat>();
  for (const row of rows) {
    const key = `${row.clanRank}:${row.clan}`;
    let stat = byKey.get(key);
    if (!stat) {
      stat = { clanRank: row.clanRank, clan: row.clan, members: 0, contributors: 0, publicProfiles: 0, inventories: 0 };
      byKey.set(key, stat);
    }
    stat.members += 1;
    if (row.warPoints > 0) stat.contributors += 1;
  }
  for (const row of enchantRows) {
    const key = `${row.clanRank}:${row.clan}`;
    const stat = byKey.get(key);
    if (!stat) continue;
    stat.publicProfiles += 1;
    if (row.inventoryPublic) stat.inventories += 1;
  }
  return Array.from(byKey.values()).sort((a, b) => a.clanRank - b.clanRank);
}

export function buildSummary(rows: ScoutRow[], enchantRows: EnchantRow[]): ScoutSummary {
  const counts = enchantCounts(enchantRows);
  return {
    totalMembers: rows.length,
    contributors: rows.filter((r) => r.warPoints > 0).length,
    publicProfiles: enchantRows.length,
    inventories: enchantRows.filter((r) => r.inventoryPublic).length,
    enchantTotal: counts.reduce((a, c) => a + c.count, 0),
    enchantCounts: counts.slice(0, 20),
    styleStats: styleStats(enchantRows),
    recommendedStyle: recommendedStyle(enchantRows),
    topScorers: topScorers(enchantRows),
    clanStats: clanStats(rows, enchantRows),
  };
}
