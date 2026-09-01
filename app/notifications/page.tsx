"use client";

import Navbar from "@/components/Navbar";
import Pressable from "@/components/Pressable";
import DiscordMarkdown from "@/components/DiscordMarkdown";
import InboxPreview from "@/components/InboxPreview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatWhen,
  groupByDay,
  insertByRecency,
  metaFor,
  relTime,
  sortByRecency,
} from "@/lib/inboxUtils";
import { resolvePlaceholders } from "@/lib/discordFormat";
import type { FilterId, HubNotification } from "@/lib/inboxUtils";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "📬 All" },
  { id: "unread", label: "🔵 Unread" },
  { id: "war", label: "⚔️ War" },
  { id: "broadcast", label: "📢 Broadcasts" },
  { id: "presence", label: "🎮 Nudges" },
];

export default function NotificationsPage() {
  const [items, setItems] = useState<HubNotification[]>([]);
  const [lastReadId, setLastReadId] = useState(0);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Distinct from "empty": a failed load must NEVER look like an empty inbox
  // (that confusion was the heart of the "push arrived, inbox empty" bug).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [officer, setOfficer] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [imageInput, setImageInput] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [filter, setFilter] = useState<FilterId>("all");
  // Free-text search over alert titles + bodies (matches against the rendered
  // plain text, so emojis/timestamps don't pollute the match).
  const [query, setQuery] = useState("");
  // New alerts that arrived while the page sat open - surfaced as a floating
  // pill instead of clobbering whatever the member is reading.
  const [pendingNew, setPendingNew] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        setLoadError(`Hub error ${res.status} - the inbox couldn't load.`);
        return;
      }
      const data = (await res.json()) as {
        notifications?: HubNotification[];
        lastReadId?: number;
        officer?: boolean;
      };
      setItems(data.notifications ?? []);
      setLastReadId(Number(data.lastReadId ?? 0));
      setOfficer(Boolean(data.officer));

      const param = Number(new URLSearchParams(window.location.search).get("n"));
      if (Number.isFinite(param) && param > 0) {
        setHighlightId(param);
      }
    } catch {
      setLoadError("Couldn't reach the hub - check your connection, then retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mirror of the newest id we already show - lets the poller spot fresh
  // alerts without re-reading React state inside intervals.
  const knownMaxRef = useRef(0);
  useEffect(() => {
    knownMaxRef.current = items.reduce((max, item) => Math.max(max, item.id), 0);
  }, [items]);

  // Silent poll: every 10s + whenever the app comes back to the foreground.
  // Faster polling so notifications feel near-instant.
  // Never mutates the list directly - just raises the "new alerts" pill.
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { notifications?: HubNotification[] };
        const serverMax = (data.notifications ?? []).reduce(
          (max, item) => Math.max(max, item.id),
          0
        );
        setPendingNew(Math.max(0, serverMax - knownMaxRef.current));
      } catch {
        // Polling is silent - only explicit loads surface the error panel.
      }
    };
    const interval = setInterval(() => void tick(), 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function refreshNow() {
    setRefreshing(true);
    await load();
    setPendingNew(0);
    setRefreshing(false);
  }

  const hero: HubNotification | null =
    items.find((item) => item.id === highlightId) ?? null;

  // Deep-linked to an alert that's not in the latest page (old or personal):
  // fetch it directly. Waits for the first load to finish (not just for ANY
  // items - a fresh inbox can legitimately be empty and still have a hero).
  useEffect(() => {
    if (!highlightId || hero || loading) return;
    let dead = false;
    fetch(`/api/notifications/${highlightId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (dead || !data) return;
        const notification = (data as { notification?: HubNotification }).notification;
        if (notification) {
          // Insert by recency - an OLD alert must land in its date group,
          // never bubble to the top of the inbox.
          setItems((prev) => insertByRecency(prev, notification));
        } else {
          setHighlightId(null); // deleted/foreign - drop the highlight cleanly
        }
      })
      .catch(() => null);
    return () => {
      dead = true;
    };
  }, [highlightId, hero, loading]);

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((item) => item.id > lastReadId).length,
      war: items.filter((item) => item.type === "war").length,
      broadcast: items.filter((item) => item.type === "broadcast").length,
      presence: items.filter((item) => item.type === "presence").length,
    }),
    [items, lastReadId]
  );

  // ALWAYS sorted newest-first - no render path may trust insertion order.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const haystack = (item: HubNotification) =>
      q
        ? `${String(item.title ?? "")} ${String(item.body ?? "")}`.toLowerCase().includes(q)
        : true;
    return sortByRecency(
      items.filter((item) => {
        if (hero && item.id === hero.id) return false; // hero lives in its own card
        if (!haystack(item)) return false;
        if (filter === "unread") return item.id > lastReadId;
        if (filter === "all") return true;
        return item.type === filter;
      })
    );
  }, [items, hero, filter, lastReadId, query]);

  const newItems = useMemo(() => visible.filter((item) => item.id > lastReadId), [visible, lastReadId]);
  const earlierItems = useMemo(
    () => visible.filter((item) => item.id <= lastReadId),
    [visible, lastReadId]
  );

  // Earlier alerts grouped Today / Yesterday / date (grouping is order-proof).
  const dayGroups = useMemo(() => groupByDay(earlierItems), [earlierItems]);

  const unreadCount = counts.unread;
  const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);

  async function persistReadMarker(body: { upTo?: number; all?: boolean }, optimistic: number) {
    const marker = lastReadId;
    setLastReadId(Math.max(lastReadId, optimistic));
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { lastReadId?: number };
      if (!res.ok) {
        setLastReadId(marker);
        return;
      }
      if (Number.isFinite(Number(data.lastReadId))) {
        setLastReadId(Number(data.lastReadId));
      }
      // Navbar badge refreshes instantly instead of waiting for its 60s poll.
      window.dispatchEvent(new CustomEvent("mcwv:alerts-changed"));
    } catch {
      setLastReadId(marker);
    }
  }

  async function markRead(upTo: number) {
    if (upTo <= lastReadId) return;
    await persistReadMarker({ upTo }, upTo);
  }

  async function markAllRead() {
    if (unreadCount === 0 || marking) return;
    setMarking(true);
    await persistReadMarker({ all: true, upTo: maxId }, Math.max(maxId, lastReadId));
    setMarking(false);
  }

  function openAlert(item: HubNotification) {
    setHighlightId(item.id);
    void markRead(item.id);
    setEditingImage(false);
    history.replaceState(null, "", `/notifications?n=${item.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveImage(imageUrl: string | null) {
    if (!hero) return;
    setImageBusy(true);
    try {
      const res = await fetch(`/api/notifications/${hero.id}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) => (item.id === hero.id ? { ...item, imageUrl } : item))
        );
        setEditingImage(false);
        setImageInput("");
      }
    } finally {
      setImageBusy(false);
    }
  }

  function renderRow(item: HubNotification, index: number) {
    const meta = metaFor(item.type);
    const isNew = item.id > lastReadId;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => openAlert(item)}
        style={{
          animation: "mcwv-row-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
          animationDelay: `${Math.min(index, 12) * 35}ms`,
        }}
        className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border p-4 pl-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
          isNew
            ? `border-emerald-400/30 bg-emerald-400/[0.08] hover:border-emerald-400/50 hover:bg-emerald-400/[0.13] ${meta.glow}`
            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
        }`}
      >
        {/* Unread accent bar */}
        {isNew ? (
          <span className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
        ) : null}

        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl transition-transform duration-200 group-hover:scale-105 ${meta.iconTile}`}
        >
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-white">{item.title}</span>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${meta.chip}`}
            >
              {meta.label}
            </span>
          </span>
          {item.body ? (
            <span
              className="mt-0.5 block text-xs leading-relaxed text-zinc-500"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <InboxPreview text={item.body} query={query} />
            </span>
          ) : null}
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            {isNew ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> : null}
            {relTime(item.createdAt)}
          </span>
        </span>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="h-11 w-11 shrink-0 rounded-xl border border-white/10 object-cover"
          />
        ) : null}
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-500 transition-all duration-200 ${
            isNew ? "bg-emerald-400/20 text-emerald-200" : "bg-white/5 group-hover:bg-white/10"
          } group-hover:text-zinc-200`}
        >
          ›
        </span>
      </button>
    );
  }

  const sectionHeader = (label: string) => (
    <div className="flex items-center gap-3 px-1 pt-5">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.07]" />
    </div>
  );

  const heroMeta = hero ? metaFor(hero.type) : null;

  const emptyCopy =
    filter === "unread"
      ? { icon: "🎉", title: "All caught up!", sub: "No unread alerts - you're on top of everything." }
      : filter !== "all"
        ? {
            icon: metaFor(filter).icon,
            title: `No ${metaFor(filter).label.toLowerCase()} alerts yet`,
            sub: "They'll land here the moment they happen.",
          }
        : {
            icon: "📭",
            title: "Nothing here yet",
            sub: "War declarations, broadcasts, and nudges will land in this inbox.",
          };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <style>{`@keyframes mcwv-row-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <Navbar />
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        {/* ---------------------------------------------------------- header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
              MCWV Alerts
            </p>
            <h1 className="mt-1 text-4xl font-black text-white sm:text-5xl">
              Inbox
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "War pings, broadcasts, and nudges."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshNow()}
              disabled={refreshing || loading}
              aria-label="Refresh inbox"
              title="Refresh"
              className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-sm text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
            </button>
            {unreadCount > 0 ? (
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-200">
                {unreadCount} new
              </span>
            ) : null}
            <Pressable
              onClick={() => void markAllRead()}
              disabled={marking || unreadCount === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-40"
            >
              Mark all read
            </Pressable>
          </div>
        </div>

        {/* ----------------------------------------------- sticky filters/search */}
        <div
          className="sticky top-[68px] z-30 -mx-2 mt-5 rounded-2xl bg-[#0a0a0a]/85 px-2 py-3 backdrop-blur-md"
          style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}
        >
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count = counts[f.id];
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition hover:-translate-y-0.5 ${
                    active
                      ? "bg-emerald-500 text-black shadow-[0_6px_24px_rgba(52,211,153,0.28)]"
                      : "border border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
                  }`}
                >
                  <span>{f.label}</span>
                  {count > 0 ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                        active ? "bg-black/25 text-white" : "bg-white/10 text-zinc-400"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="relative mt-2.5">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
              🔍
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search alerts…"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-9 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-400/50 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-3 flex items-center text-zinc-500 transition hover:text-zinc-200"
              >
                ✕
              </button>
            ) : null}
          </div>
          {query ? (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              {visible.length} result{visible.length === 1 ? "" : "s"} for “{query}”
            </p>
          ) : null}
        </div>

        {/* ------------------------------------------------------------- hero */}
        {hero && heroMeta ? (
          <section
            className="mt-6 overflow-hidden rounded-3xl border border-emerald-400/35 bg-gradient-to-b from-emerald-500/[0.12] to-transparent shadow-[0_0_40px_rgba(52,211,153,0.12)]"
            style={{ animation: "mcwv-row-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <div className="flex items-center justify-between bg-emerald-500/15 px-6 py-3">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] ${heroMeta.chip}`}
                >
                  {heroMeta.icon} {heroMeta.label}
                </span>
                <span>· From your notification</span>
              </p>
              <button
                type="button"
                aria-label="Close alert"
                onClick={() => {
                  setHighlightId(null);
                  history.replaceState(null, "", "/notifications");
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/15 hover:text-white"
              >
                ✕
              </button>
            </div>
            {hero.imageUrl ? (
              <a href={hero.imageUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={hero.imageUrl}
                  alt="Alert attachment"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  // object-contain: the WHOLE image, never cropped.
                  className="max-h-[60vh] w-full border-b border-emerald-400/20 bg-black/40 object-contain transition hover:opacity-95"
                />
              </a>
            ) : null}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-2xl ${heroMeta.iconTile}`}
                >
                  {heroMeta.icon}
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-black leading-tight text-white">{hero.title}</h2>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {formatWhen(hero.createdAt)}
                    {hero.id > lastReadId ? " · unread" : ""}
                  </p>
                </div>
              </div>
              {hero.body ? (
                <div className="mt-4 break-words text-sm leading-relaxed text-zinc-300">
                  <DiscordMarkdown text={resolvePlaceholders(hero.body)} />
                </div>
              ) : null}
              {officer ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingImage((v) => !v);
                      setImageInput(hero.imageUrl ?? "");
                    }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
                  >
                    🖼️ {hero.imageUrl ? "Change image" : "Attach image"}
                  </button>
                </div>
              ) : null}

              {officer && editingImage ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs font-semibold text-zinc-400">
                    Paste a direct image link (Discord CDN, imgur, /og-card.png
                    style). Leave empty + Save to clear.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="url"
                      value={imageInput}
                      onChange={(event) => setImageInput(event.target.value)}
                      placeholder="https://…/banner.png"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-400/50"
                    />
                    <Pressable
                      disabled={imageBusy}
                      onClick={() => void saveImage(imageInput.trim() || null)}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
                    >
                      {imageBusy ? "Saving..." : "Save"}
                    </Pressable>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ------------------------------------------------------------- list */}
        <section className="mt-6">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                  style={{ opacity: 1 - i * 0.22 }}
                >
                  <div className="h-11 w-11 shrink-0 rounded-2xl bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-1/2 rounded-full bg-white/10" />
                    <div className="h-2.5 w-3/4 rounded-full bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-3xl border border-rose-400/30 bg-rose-500/[0.08] p-10 text-center">
              <p className="text-4xl">📡</p>
              <p className="mt-3 text-sm font-bold text-rose-200">Inbox failed to load</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-rose-200/70">
                {loadError} Your alerts aren&apos;t gone - this is a hiccup, not an empty
                inbox.
              </p>
              <Pressable
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                className="mt-4 rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-black"
              >
                Retry
              </Pressable>
            </div>
          ) : visible.length === 0 && !hero ? (
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-3xl">
                {emptyCopy.icon}
              </div>
              <p className="mt-4 text-base font-semibold text-zinc-200">{emptyCopy.title}</p>
              <p className="mt-1.5 text-sm text-zinc-500">{emptyCopy.sub}</p>
              {filter === "all" ? (
                <a
                  href="/settings"
                  className="mt-4 inline-block rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/15"
                >
                  🔔 Test your alerts in Settings →
                </a>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {newItems.length > 0 ? (
                <>
                  {sectionHeader(`🔥 New · ${newItems.length}`)}
                  <div className="space-y-2">{newItems.map((item, i) => renderRow(item, i))}</div>
                </>
              ) : null}
              {dayGroups.map((group, gi) => {
                // Running index so the entrance cascade flows across sections.
                const base =
                  newItems.length +
                  dayGroups.slice(0, gi).reduce((sum, g) => sum + g.rows.length, 0);
                return (
                  <div key={`${group.label}-${gi}`} className="space-y-2">
                    {sectionHeader(group.label)}
                    <div className="space-y-2">
                      {group.rows.map((item, i) => renderRow(item, base + i))}
                    </div>
                  </div>
                );
              })}
              {!hero && visible.length > 0 ? (
                <p className="px-1 pt-4 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">
                  Alerts keep for 30 days · newest {visible.length} shown
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* ---------------------------------------------- floating "new" pill */}
      {pendingNew > 0 && !loading ? (
        <Pressable
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            void refreshNow();
          }}
          style={{
            animation: "mcwv-row-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          className="fixed inset-x-0 bottom-24 z-[55] mx-auto w-fit max-w-[calc(100vw-6rem)] rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-black shadow-[0_10px_40px_rgba(52,211,153,0.32)]"
        >
          {refreshing
            ? "Loading new alerts..."
            : `${pendingNew} new alert${pendingNew === 1 ? "" : "s"} - tap to view`}
        </Pressable>
      ) : null}
    </main>
  );
}
