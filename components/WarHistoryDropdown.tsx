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
  onSelect: (battleId: string | null) => void;
};

export default function WarHistoryDropdown({
  selectedBattleId,
  onSelect,
}: WarHistoryDropdownProps) {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch battle history
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format date for display
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Unknown date";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // Get display name for selected battle
  function getSelectedName(): string {
    if (!selectedBattleId) return "Current War";
    const battle = battles.find((b) => b.battle_id === selectedBattleId);
    if (!battle) return "Current War";
    return battle.battle_name || battle.battle_id || "Unknown War";
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="group relative inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-all duration-300 hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 hover:shadow-[0_0_20px_var(--glow)]"
      >
        {/* Animated background gradient on hover */}
        <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--primary)]/0 via-[var(--primary)]/5 to-[var(--primary)]/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        {/* Chevron with rotation animation */}
        <svg
          className={`h-4 w-4 text-[var(--primary)] transition-transform duration-300 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>

        <span className="relative z-10 truncate max-w-[200px] sm:max-w-[280px]">
          {loading ? "Loading..." : getSelectedName()}
        </span>

        {/* Pulsing glow effect */}
        <span
          className={`absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 ${
            isOpen ? "opacity-100" : "group-hover:opacity-70"
          }`}
          style={{
            boxShadow: "0 0 30px var(--glow)",
          }}
        />
      </button>

      {/* Dropdown Menu with Animations */}
      {isOpen && (
        <>
          {/* Backdrop with fade animation */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            style={{ animation: "fadeIn 0.2s ease-out" }}
          />

          {/* Dropdown Content */}
          <div
            className="absolute top-full left-0 z-20 mt-2 w-full min-w-[280px] origin-top rounded-xl border border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-xl shadow-2xl"
            style={{
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px var(--glow)",
              animation: "scaleIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {/* Current War Option */}
            <div
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`relative cursor-pointer rounded-t-xl p-4 transition-all duration-300 hover:bg-[var(--primary)]/10 ${
                !selectedBattleId
                  ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
                  : ""
              }}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[var(--foreground)]">
                    Current War
                  </p>
                  <p className="text-xs text-zinc-400">Live leaderboard</p>
                </div>
                {!selectedBattleId && (
                  <span className="text-[var(--primary)]">✓</span>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border)]" />

            {/* Historical Battles */}
            {battles.length > 0 ? (
              battles.map((battle, index) => (
                <div
                  key={battle.battle_id}
                  onClick={() => {
                    onSelect(battle.battle_id);
                    setIsOpen(false);
                  }}
                  className={`relative cursor-pointer p-4 transition-all duration-300 hover:bg-[var(--primary)]/10 ${
                    selectedBattleId === battle.battle_id
                      ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
                      : ""
                  } ${index === 0 ? "rounded-t-xl" : ""} ${
                    index === battles.length - 1 ? "rounded-b-xl" : ""
                  }`}
                  style={{
                    animation: `slideIn 0.3s ease-out ${index * 0.05}s both`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[var(--foreground)]">
                        {battle.battle_name ||
                          `War #${battle.battle_id.slice(0, 8)}`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span>Starts: {formatDate(battle.start_time)}</span>
                        {battle.end_time && (
                          <span>Ends: {formatDate(battle.end_time)}</span>
                        )}
                      </div>
                    </div>
                    {selectedBattleId === battle.battle_id && (
                      <span className="ml-2 text-[var(--primary)]">✓</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-zinc-400">
                No historical wars found
              </div>
            )}
          </div>
        </>
      )}

      {/* Animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-0.25rem);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-0.5rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
