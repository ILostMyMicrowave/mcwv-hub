"use client";

import { useEffect, useRef, useState } from "react";

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

function isEnded(battle: Battle): boolean {
  return typeof battle.end_time === "string" && new Date(battle.end_time) < new Date();
}

export default function WarHistoryDropdown({ selectedBattleId, onSelect }: WarHistoryDropdownProps) {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const selectId = (id: string | null, name: string | null) => {
    onSelect(id, name);
    setIsOpen(false);
  };

  const getSelectedName = (): string => {
    if (!selectedBattleId) return "Current War";
    const b = battles.find((x) => x.battle_id === selectedBattleId);
    return b?.battle_name || b?.battle_id || "Current War";
  };

  const getSelectedEnd = (): string | null => {
    if (!selectedBattleId) return null;
    const b = battles.find((x) => x.battle_id === selectedBattleId);
    return b ? formatDate(b.end_time) : null;
  };

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
          {!loading && getSelectedEnd() ? (
            <span className="truncate text-[11px] text-zinc-400">
              Ended {getSelectedEnd()}
            </span>
          ) : !loading && !selectedBattleId ? (
            <span className="truncate text-[11px] text-zinc-400">Live leaderboard</span>
          ) : null}
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
            className="absolute left-0 right-0 top-full z-[100] mt-2 w-full min-w-[280px] origin-top overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl sm:left-0 sm:right-auto sm:w-[360px]"
            style={{
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px var(--glow)",
              animation: "scaleIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
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

            {/* Scrollable list */}
            <div className="max-h-[60vh] overflow-y-auto">
              {battles.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-400">
                  {loading ? "Loading wars…" : "No historical wars found"}
                </div>
              ) : (
                battles.map((battle, index) => {
                  const active = selectedBattleId === battle.battle_id;
                  const ended = isEnded(battle);
                  return (
                    <button
                      key={battle.battle_id}
                      type="button"
                      onClick={() => selectId(battle.battle_id, battle.battle_name || battle.battle_id)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-white/5 px-4 py-3 text-left transition-all duration-200 ${
                        active
                          ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]"
                          : "hover:bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
                      } ${index === battles.length - 1 ? "rounded-b-xl" : ""}`}
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
                        {battle.end_time && (
                          <p className="mt-1 text-xs text-zinc-400">
                            Ended {formatDate(battle.end_time)}
                          </p>
                        )}
                      </div>
                      {active && <span className="ml-2 shrink-0 text-[var(--primary)]">✓</span>}
                    </button>
                  );
                })
              )}
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
