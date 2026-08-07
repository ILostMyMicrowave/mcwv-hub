"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  matchFamilyId,
  rbxIconUrl,
  summarizeBuild,
  type BuilderEnchantFamily,
  type BuilderSlot,
  type EnchantRow,
} from "@/lib/scoutAnalysis";

const NORMAL_SLOTS = 6;
const PAID_SLOTS = 3;
const SLOT_COUNT = NORMAL_SLOTS + PAID_SLOTS;
const BUILDS_KEY = "mcwv-scout-builds-v1";

type SavedBuild = { name: string; savedAt: string; slots: Array<BuilderSlot | null> };

function loadSaved(): SavedBuild[] {
  try {
    const raw = localStorage.getItem(BUILDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SlotIcon({ icon, label }: { icon: string; label: string }) {
  const url = rbxIconUrl(icon);
  if (!url) return <span className="text-2xl">📕</span>;
  // Real PS99 item art, hosted by the official API.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={label} className="h-12 w-12 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" loading="lazy" />;
}

export default function EnchantBuilder({ rivals }: { rivals: EnchantRow[] }) {
  const [families, setFamilies] = useState<BuilderEnchantFamily[]>([]);
  const [familiesAt, setFamiliesAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<Array<BuilderSlot | null>>(() => Array(SLOT_COUNT).fill(null));
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedBuild[]>([]);
  const [buildName, setBuildName] = useState("");

  const fetchFamilies = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/scout/enchants", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "failed to load enchants");
      setFamilies(data.families ?? []);
      setFamiliesAt(data.syncedAt ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "failed to load enchants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFamilies();
    setSaved(loadSaved());
  }, [fetchFamilies]);

  const famById = useMemo(() => new Map(families.map((f) => [f.id, f] as const)), [families]);

  const filledSlots = useMemo(
    () => slots.filter((s): s is BuilderSlot => s !== null),
    [slots]
  );
  const summary = useMemo(() => summarizeBuild(filledSlots, families), [filledSlots, families]);

  const visibleFamilies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? families.filter((f) => f.name.toLowerCase().includes(q)) : families;
  }, [families, query]);

  function setSlot(index: number, slot: BuilderSlot | null) {
    setSlots((prev) => prev.map((s, i) => (i === index ? slot : s)));
  }

  function assignToActiveSlot(family: BuilderEnchantFamily, tierIndex: number) {
    if (pickerSlot === null) return;
    setSlot(pickerSlot, { familyId: family.id, tierIndex, tierPower: family.tiers[tierIndex]?.power ?? 0 });
  }

  function fillAllEmpty(family: BuilderEnchantFamily, tierIndex: number) {
    const power = family.tiers[tierIndex]?.power ?? 0;
    setSlots((prev) => prev.map((s) => (s === null ? { familyId: family.id, tierIndex, tierPower: power } : s)));
  }

  function importRival(userId: string) {
    setImportNote(null);
    const row = rivals.find((r) => r.userId === userId);
    if (!row) return;
    const next: Array<BuilderSlot | null> = Array(SLOT_COUNT).fill(null);
    let matched = 0;
    const unmatched: string[] = [];
    row.enchantNames.slice(0, SLOT_COUNT).forEach((name, i) => {
      const famId = matchFamilyId(name, families);
      if (famId) {
        const fam = famById.get(famId);
        const tierIndex = Math.max(0, (fam?.tiers.length ?? 1) - 1);
        next[i] = { familyId: famId, tierIndex, tierPower: fam?.tiers[tierIndex]?.power ?? 0 };
        matched += 1;
      } else if (name) {
        unmatched.push(name);
      }
    });
    setSlots(next);
    setImportNote(
      `📥 Imported ${matched}/${Math.min(row.enchantNames.length, SLOT_COUNT)} of ${row.username ?? "rival"}'s books — tiers guessed at max (rivals hide tiers).` +
        (unmatched.length ? ` Unmatched: ${unmatched.join(", ")}` : "")
    );
  }

  function saveBuild() {
    const name = buildName.trim() || `Build ${new Date().toLocaleDateString("en-GB")}`;
    const next = [{ name, savedAt: new Date().toISOString(), slots }, ...saved.filter((b) => b.name !== name)].slice(0, 10);
    setSaved(next);
    localStorage.setItem(BUILDS_KEY, JSON.stringify(next));
    setBuildName("");
    setImportNote(`💾 Saved "${name}" (this browser only).`);
  }

  function loadBuild(name: string) {
    const build = saved.find((b) => b.name === name);
    if (!build) return;
    setSlots(Array.from({ length: SLOT_COUNT }, (_, i) => build.slots[i] ?? null));
  }

  function deleteBuild(name: string) {
    const next = saved.filter((b) => b.name !== name);
    setSaved(next);
    localStorage.setItem(BUILDS_KEY, JSON.stringify(next));
  }

  const publicRivals = rivals.filter((r) => r.inventoryPublic && r.enchantNames.length > 0);

  return (
    <section className="mt-6 rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/[0.07] via-transparent to-violet-500/[0.05] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">🧬 Enchant Builder</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            In-game-style slots · real tier powers + stack math{familiesAt ? " · data fresh as of sync" : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {publicRivals.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) importRival(e.target.value); e.target.value = ""; }}
              className="rounded-xl border border-fuchsia-400/30 bg-black/40 px-3 py-2 text-xs font-bold text-fuchsia-200 focus:outline-none"
            >
              <option value="">📥 Import rival loadout…</option>
              {publicRivals.map((r) => (
                <option key={r.userId} value={r.userId}>
                  #{r.clanRank} {r.clan} · {r.username ?? r.userId} ({r.enchantNames.length}📕)
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => { setSlots(Array(SLOT_COUNT).fill(null)); setImportNote(null); }}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-400 transition hover:text-white"
          >
            🧹 Clear
          </button>
        </div>
      </div>

      {importNote && <p className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-zinc-300">{importNote}</p>}
      {loadError && (
        <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          ⚠️ {loadError} — <button className="font-bold underline" onClick={() => void fetchFamilies()}>retry</button>
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Slot layout */}
        <div>
          <div className="flex flex-wrap gap-2.5">
            {slots.map((slot, i) => {
              const paid = i >= NORMAL_SLOTS;
              const fam = slot ? famById.get(slot.familyId) : null;
              const tier = fam && slot ? fam.tiers[slot.tierIndex] : null;
              return (
                <button
                  key={i}
                  onClick={() => setPickerSlot(i)}
                  className={`group relative flex h-[76px] w-[76px] flex-col items-center justify-center rounded-2xl border transition active:scale-95 ${
                    paid ? "border-dashed border-amber-400/40 bg-amber-500/[0.05]" : "border-white/10 bg-white/[0.04]"
                  } ${slot ? "hover:border-fuchsia-400/50" : "hover:border-white/30"}`}
                >
                  {paid && <span className="absolute -top-2 rounded-full bg-amber-400/20 px-1.5 text-[8px] font-black text-amber-300">💎PAID</span>}
                  {slot && fam ? (
                    <>
                      <span className="absolute right-1 top-1 rounded-md bg-black/60 px-1 text-[9px] font-black text-fuchsia-300">T{slot.tierIndex + 1}</span>
                      <SlotIcon icon={tier?.icon ?? fam.icon} label={fam.name} />
                      <span className="mt-0.5 text-[9px] font-bold leading-none text-zinc-300">+{tier?.power ?? slot.tierPower}</span>
                      <span className="max-w-[70px] truncate text-[8px] leading-none text-zinc-500">{fam.name}</span>
                    </>
                  ) : (
                    <span className="text-xl text-zinc-600 transition group-hover:text-zinc-400">＋</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Saved builds */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
              placeholder="Build name…"
              className="w-36 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-fuchsia-400/50 focus:outline-none"
            />
            <button
              onClick={saveBuild}
              disabled={filledSlots.length === 0}
              className="rounded-xl bg-fuchsia-500/80 px-3 py-2 text-xs font-black text-white transition hover:bg-fuchsia-400 disabled:opacity-40"
            >
              💾 Save
            </button>
            {saved.map((b) => (
              <span key={b.name} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 py-1 pl-3 pr-1.5 text-[11px] text-zinc-300">
                <button className="font-bold hover:text-white" onClick={() => loadBuild(b.name)}>📂 {b.name}</button>
                <button className="rounded-full px-1.5 text-zinc-500 hover:text-rose-300" onClick={() => deleteBuild(b.name)}>✕</button>
              </span>
            ))}
          </div>
        </div>

        {/* Stack math panel */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">📊 Stack math</h3>
          {summary.rows.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-600">Tap a slot and add books — combined power + diminishing thresholds appear here.</p>
          ) : (
            <>
              <div className="mt-2 grid gap-2">
                {summary.rows.map((row) => (
                  <div key={row.familyId}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-100">
                        {row.name} <span className="text-zinc-500">×{row.copies}</span>
                      </span>
                      <span className="text-xs font-black text-fuchsia-300">{row.combined}</span>
                    </div>
                    {row.threshold !== null && (
                      <>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full ${row.status === "over" ? "bg-gradient-to-r from-rose-500 to-red-400" : row.status === "cap" ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-violet-500 to-fuchsia-400"}`}
                            style={{ width: `${Math.min(100, (row.combined / row.threshold) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {row.status === "cap" && <span className="font-bold text-emerald-300">🎯 PERFECT — right at the {row.threshold} cap</span>}
                          {row.status === "under" && <span>{row.threshold - row.combined} more power before diminishing</span>}
                          {row.status === "over" && <span className="font-bold text-rose-300">⚠️ {row.overBy} power wasted past the {row.threshold} cap</span>}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-2.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Total (all books)</span>
                <span className="text-lg font-black text-white">{summary.totalPower}</span>
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">{summary.usedSlots}/{SLOT_COUNT} slots used.</p>
            </>
          )}
        </div>
      </div>

      {/* Picker modal */}
      {pickerSlot !== null && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={() => setPickerSlot(null)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0e]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/10 p-4">
              <span className="text-sm font-black text-white">Slot #{pickerSlot + 1}{pickerSlot >= NORMAL_SLOTS ? " 💎" : ""}</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search enchants…"
                className="ml-2 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-fuchsia-400/50 focus:outline-none"
              />
              {slots[pickerSlot] && (
                <button
                  onClick={() => { setSlot(pickerSlot, null); setPickerSlot(null); }}
                  className="rounded-xl border border-rose-400/30 px-2.5 py-2 text-xs font-bold text-rose-300"
                >
                  🗑
                </button>
              )}
              <button onClick={() => setPickerSlot(null)} className="rounded-xl border border-white/10 px-2.5 py-2 text-xs font-bold text-zinc-400">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              {loading && <p className="py-6 text-center text-xs text-zinc-500">Loading enchant bible…</p>}
              <div className="grid gap-1.5">
                {visibleFamilies.map((fam) => (
                  <div key={fam.id} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-black/20 px-3 py-2.5">
                    <SlotIcon icon={fam.icon} label={fam.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">{fam.name}</p>
                      <p className="truncate text-[10px] text-zinc-500">{fam.tiers[fam.tiers.length - 1]?.desc ?? ""}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {fam.tiers.map((tier, ti) => (
                          <button
                            key={tier.displayName}
                            onClick={() => assignToActiveSlot(fam, ti)}
                            title={tier.desc}
                            className="rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-2 py-1 text-[10px] font-black text-fuchsia-200 transition hover:bg-fuchsia-500/25 active:scale-95"
                          >
                            T{ti + 1} · +{tier.power}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => fillAllEmpty(fam, fam.tiers.length - 1)}
                      title="Fill every empty slot with the max tier"
                      className="shrink-0 rounded-xl border border-white/10 px-2 py-2 text-[10px] font-bold text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
                    >
                      ⇥ all
                    </button>
                  </div>
                ))}
                {!loading && visibleFamilies.length === 0 && <p className="py-6 text-center text-xs text-zinc-500">No enchants match 🎣</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
