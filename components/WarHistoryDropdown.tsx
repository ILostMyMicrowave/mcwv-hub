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

  const isLive = !selectedBattleId;

  return (
    <div className="relative z-[90] inline-block w-full overflow-visible sm:w-auto" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={loading}
        className="group relative inline-flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-3 pr-4 text-left shadow-lg shadow-black/10 transition-all duration-300 hover:border-[var(--primary)]/50 hover:shadow-[0_0_24px_var(--glow)] sm:w-72"
      >
        {/* Leading icon */}
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-colors duration-300 ${
            isLive
              ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
              : "bg-white/5"
          }`}
        >
          {isLive ? "⚔️" : "🏆"}
        </span>

        <span className="relative z-10 flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[var(--foreground)]">
              {loading ? "Loading…" : getSelectedName()}
            </span>
            {isLive && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--primary)]" />
              </span>
            )}
          </span>
          <span className="truncate text-[11px] text-zinc-400">
            {loading
              ? ""
              : isLive
                ? "Live leaderboard"
                : getSelectedEnd()
                  ? `Ended ${getSelectedEnd()}`
                  : "Historical war"}
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-[var(--primary)] transition-transform duration-300 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/25 backdrop-blur-sm sm:hidden"
            onClick={() => setIsOpen(false)}
            style={{ animation: "fadeIn 0.2s ease-out" }}
          />

          <div
            className="absolute left-0 right-0 top-full z-[100] mt-2 w-full min-w-[300px] origin-top overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-2xl sm:left-0 sm:right-auto sm:w-[380px]"
            style={{
              boxShadow: "0 24px 70px rgba(0,0,0,0.55), 0 0 30px var(--glow)",
              animation: "scaleIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-white/[0.02] px-4 py-3">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--foreground)]/60">
                <span className="text-[var(--primary)]">⚔️</span> War history
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                {battles.length} cached
              </span>
            </div>

            {/* Current War */}
            <button
              type="button"
              onClick={() => selectId(null, null)}
              className={`group/current flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-200 ${
                isLive
                  ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]"
                  : "hover:bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${
                  isLive ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)]" : "bg-white/5"
                }`}
              >
                ⚔️
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--foreground)]">Current War</span>
                <span className="block text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Live leaderboard
                  </span>
                </span>
              </span>
              {isLive && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/25 text-[11px] font-black text-[var(--primary)]">
                  ✓
                </span>
              )}
            </button>

            <div className="mx-4 h-px bg-[var(--border)]" />

            {/* Scrollable list */}
            <div className="max-h-[55vh] overflow-y-auto p-1.5">
              {battles.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="text-3xl">🗂️</div>
                  <p className="mt-2 text-sm text-zinc-400">
                    {loading ? "Loading wars…" : "No historical wars cached yet"}
                  </p>
                </div>
              ) : (
                battles.map((battle) => {
                  const active = selectedBattleId === battle.battle_id;
                  const ended = isEnded(battle);
                  return (
                    <button
                      key={battle.battle_id}
                      type="button"
                      onClick={() => selectId(battle.battle_id, battle.battle_name || battle.battle_id)}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                        active
                          ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] ring-1 ring-[var(--primary)]/25"
                          : "hover:bg-[color-mix(in_srgb,var(--primary)_7%,var(--card))]"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base transition-colors ${
                          active ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]" : "bg-white/[0.04]"
                        }`}
                      >
                        🏆
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {battle.battle_name || `War #${battle.battle_id.slice(0, 8)}`}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                          {ended ? (
                            <>
                              <span>Ended {formatDate(battle.end_time)}</span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Active
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-all duration-200 ${
                          active
                            ? "bg-[var(--primary)]/25 text-[var(--primary)] scale-100 opacity-100"
                            : "scale-50 opacity-0"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] bg-white/[0.02] px-4 py-2.5 text-center text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Cached war leaderboards
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
          from { opacity: 0; transform: scale(0.96) translateY(-0.3rem); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
