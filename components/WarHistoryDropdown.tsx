"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Battle = {
  battle_id: string;
  battle_name: string | null;
  start_time: string | null;
  end_time: string | null;
};

type WarHistoryDropdownProps = {
  selectedBattleId: string | null;
  onSelect: (battleId: string | null, battleName?: string | null) => void;
};

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatRange(start: string | null, end: string | null): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} → ${e}`;
  if (s) return `Starts ${s}`;
  if (e) return `Ended ${e}`;
  return "No dates";
}

function isEnded(battle: Battle): boolean {
  return Boolean(battle.end_time) && new Date(battle.end_time) < new Date();
}

export default function WarHistoryDropdown({ selectedBattleId, onSelect }: WarHistoryDropdownProps) {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await fetch("/api/war/history", { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.battles)) {
          setBattles(json.battles);
        }
      } catch (err) {
        console.error("[WarHistoryDropdown] Failed to fetch history:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset scroll/highlight when the panel opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlight(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Filter + group wars by year (newest first, already sorted DESC by API)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return battles;
    return battles.filter((b) => {
      const name = (b.battle_name || b.battle_id).toLowerCase();
      return name.includes(q);
    });
  }, [battles, query]);

  const groups = useMemo(() => {
    const map = new Map<number, Battle[]>();
    for (const b of filtered) {
      const year = new Date(b.start_time || b.end_time || "").getFullYear();
      const key = Number.isNaN(year) ? 0 : year;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => ({ year: year || null, list }));
  }, [filtered]);

  const selectId = (id: string | null, name: string | null) => {
    onSelect(id, name);
    setIsOpen(false);
  };

  const getSelectedName = (): string => {
    if (!selectedBattleId) return "Current War";
    const b = battles.find((x) => x.battle_id === selectedBattleId);
    return b?.battle_name || b?.battle_id || "Current War";
  };

  const getSelectedRange = (): string | null => {
    if (!selectedBattleId) return "Live leaderboard";
    const b = battles.find((x) => x.battle_id === selectedBattleId);
    return b ? formatRange(b.start_time, b.end_time) : null;
  };

  // Keyboard navigation: Up/Down move highlight, Enter selects, Esc closes
  function handleKeyDown(e: React.KeyboardEvent) {
    const options = filtered;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && options[highlight]) {
        const b = options[highlight];
        selectId(b.battle_id, b.battle_name || b.battle_id);
      } else if (highlight === -1 && options.length === 0) {
        selectId(null, null);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlight >= 0 && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlight]);

  return (
    <div className="relative z-[90] inline-block w-full overflow-visible sm:w-auto" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={loading}
        className="group relative inline-flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-left transition-all duration-300 hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 hover:shadow-[0_0_20px_var(--glow)] sm:w-64"
      >
        <span className="relative z-10 flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-[var(--foreground)]">
            {loading ? "Loading..." : getSelectedName()}
          </span>
          {!loading && (
            <span className="truncate text-[11px] text-zinc-400">{getSelectedRange()}</span>
          )}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-[var(--primary)] transition-transform duration-300 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/20 sm:hidden"
            onClick={() => setIsOpen(false)}
            style={{ animation: "fadeIn 0.2s ease-out" }}
          />

          <div
            className="absolute left-0 right-0 top-full z-[100] mt-2 w-full min-w-[280px] origin-top overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl sm:left-0 sm:right-auto sm:w-[380px]"
            style={{
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px var(--glow)",
              animation: "scaleIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {/* Search */}
            <div className="border-b border-[var(--border)] p-2">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                  />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search wars…"
                  className="w-full rounded-lg border border-[var(--border)] bg-black/20 py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--primary)]/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Scrollable list */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
              {/* Current War */}
              <button
                type="button"
                onClick={() => selectId(null, null)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-all duration-200 hover:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))] ${
                  !selectedBattleId
                    ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] ring-1 ring-[var(--primary)]/30"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Current War</p>
                  <p className="text-xs text-zinc-400">Live leaderboard</p>
                </div>
                {!selectedBattleId && <span className="text-[var(--primary)]">✓</span>}
              </button>

              <div className="h-px bg-[var(--border)]" />

              {groups.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-400">
                  {query ? "No wars match your search" : "No historical wars found"}
                </div>
              ) : (
                groups.map(({ year, list }) => (
                  <div key={year ?? "unknown"}>
                    {/* Sticky year header */}
                    <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]/95 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 backdrop-blur">
                      {year ?? "Historical"} · {list.length} {list.length === 1 ? "war" : "wars"}
                    </div>
                    {list.map((battle) => {
                      const idx = filtered.indexOf(battle);
                      const ended = isEnded(battle);
                      const active = selectedBattleId === battle.battle_id;
                      return (
                        <button
                          key={battle.battle_id}
                          type="button"
                          data-idx={idx}
                          onClick={() => selectId(battle.battle_id, battle.battle_name || battle.battle_id)}
                          onMouseEnter={() => setHighlight(idx)}
                          className={`flex w-full items-center justify-between gap-2 border-b border-white/5 px-4 py-3 text-left transition-all duration-200 ${
                            active
                              ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]"
                              : "hover:bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
                          } ${highlight === idx ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))]" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                                {battle.battle_name || `War #${battle.battle_id.slice(0, 8)}`}
                              </p>
                              {ended ? (
                                <span className="shrink-0 rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-white/10">
                                  Ended
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-zinc-400">{formatRange(battle.start_time, battle.end_time)}</p>
                          </div>
                          {active && <span className="ml-2 shrink-0 text-[var(--primary)]">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="border-t border-[var(--border)] px-4 py-2 text-center text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              ↑ ↓ to navigate · Enter to select · Esc to close
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(-0.25rem); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
