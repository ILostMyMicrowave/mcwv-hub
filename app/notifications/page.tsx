"use client";

import Navbar from "@/components/Navbar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HubNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  imageUrl: string | null;
  createdAt: string;
};

type FilterId = "all" | "unread" | "war" | "broadcast" | "presence";

// Per-type personality: icon, chip label + colours, icon tile, and a soft
// glow for unread rows. Class strings stay literal so Tailwind keeps them.
const TYPE_META: Record<
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

function metaFor(type: string) {
  return TYPE_META[type] ?? FALLBACK_META;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function relTime(iso: string) {
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

function dayLabelOf(iso: string) {
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

// The notification row stores the REAL destination page — give the CTA a
// label that matches where it goes instead of a generic "Open page".
function ctaFor(url: string | null): { href: string; label: string } | null {
  if (!url || url.startsWith("/notifications")) return null;
  if (url.startsWith("/war")) return { href: url, label: "⚔️ Open War Room" };
  if (url.startsWith("/leaderboard")) return { href: url, label: "🏆 Open Leaderboard" };
  if (url.startsWith("/dashboard")) return { href: url, label: "📊 Open Dashboard" };
  if (url.startsWith("/settings")) return { href: url, label: "⚙️ Open Settings" };
  return { href: url, label: "Open page →" };
}

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
  // New alerts that arrived while the page sat open — surfaced as a floating
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
        setLoadError(`Hub error ${res.status} — the inbox couldn't load.`);
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
      setLoadError("Couldn't reach the hub — check your connection, then retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mirror of the newest id we already show — lets the poller spot fresh
  // alerts without re-reading React state inside intervals.
  const knownMaxRef = useRef(0);
  useEffect(() => {
    knownMaxRef.current = items.reduce((max, item) => Math.max(max, item.id), 0);
  }, [items]);

  // Silent poll: every 30s + whenever the app comes back to the foreground.
  // Never mutates the list directly — just raises the "new alerts" pill.
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
        // Polling is silent — only explicit loads surface the error panel.
      }
    };
    const interval = setInterval(() => void tick(), 30_000);
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
  // fetch it directly and show it alone on top.
  useEffect(() => {
    if (!highlightId || hero || items.length === 0) return;
    let dead = false;
    fetch(`/api/notifications/${highlightId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (dead || !data) return;
        const notification = (data as { notification?: HubNotification }).notification;
        if (notification) {
          setItems((prev) => [notification, ...prev]);
        } else {
          setHighlightId(null); // deleted/foreign — drop the highlight cleanly
        }
      })
      .catch(() => null);
    return () => {
      dead = true;
    };
  }, [highlightId, hero, items.length]);

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

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (hero && item.id === hero.id) return false; // hero lives in its own card
        if (filter === "unread") return item.id > lastReadId;
        if (filter === "all") return true;
        return item.type === filter;
      }),
    [items, hero, filter, lastReadId]
  );

  const newItems = useMemo(() => visible.filter((item) => item.id > lastReadId), [visible, lastReadId]);
  const earlierItems = useMemo(
    () => visible.filter((item) => item.id <= lastReadId),
    [visible, lastReadId]
  );

  // Earlier alerts grouped Today / Yesterday / date — items arrive id-desc,
  // so consecutive grouping just works.
  const dayGroups = useMemo(() => {
    const groups: { label: string; rows: HubNotification[] }[] = [];
    for (const item of earlierItems) {
      const label = dayLabelOf(item.createdAt);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.label === label) lastGroup.rows.push(item);
      else groups.push({ label, rows: [item] });
    }
    return groups;
  }, [earlierItems]);

  const unreadCount = counts.unread;
  const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);

  async function markRead(upTo: number) {
    if (upTo <= lastReadId) return;
    const marker = lastReadId;
    setLastReadId(Math.max(lastReadId, upTo)); // optimistic
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upTo }),
      });
    } catch {
      setLastReadId(marker); // roll back if the write failed
    }
  }

  async function markAllRead() {
    if (maxId === 0 || marking) return;
    setMarking(true);
    await markRead(maxId);
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
        className={`flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${
          isNew
            ? `border-violet-400/30 bg-violet-400/[0.08] hover:bg-violet-400/[0.13] ${meta.glow}`
            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl ${meta.iconTile}`}
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
            {isNew ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
              </span>
            ) : null}
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
              {item.body}
            </span>
          ) : null}
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
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
        <span className="shrink-0 text-zinc-600 transition group-hover:text-zinc-300">›</span>
      </button>
    );
  }

  const sectionHeader = (label: string) => (
    <div className="flex items-center gap-3 px-1 pt-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.07]" />
    </div>
  );

  const heroMeta = hero ? metaFor(hero.type) : null;
  const heroCta = hero ? ctaFor(hero.url) : null;

  const emptyCopy =
    filter === "unread"
      ? { icon: "🎉", title: "All caught up!", sub: "No unread alerts — you're on top of everything." }
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
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-400">
              MCWV Alerts
            </p>
            <h1 className="mt-1 bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
              Inbox
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {unreadCount > 0
                ? `${unreadCount} unread — fresh off the wire ⚡`
                : "War pings, broadcasts, and nudges — all in one place."}
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
              <span className="rounded-full border border-violet-400/40 bg-violet-400/15 px-3 py-1.5 text-xs font-bold text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.25)]">
                {unreadCount} new
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={marking || unreadCount === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              ✓ Mark all read
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------ filter pills */}
        <div className="mt-5 flex flex-wrap gap-2">
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
                    ? "bg-gradient-to-r from-violet-500 to-fuchsia-400 text-white shadow-[0_6px_24px_rgba(139,92,246,0.4)]"
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

        {/* ------------------------------------------------------------- hero */}
        {hero && heroMeta ? (
          <section
            className="mt-6 overflow-hidden rounded-3xl border border-violet-400/35 bg-gradient-to-b from-violet-500/[0.12] to-transparent shadow-[0_0_50px_rgba(124,58,237,0.18)]"
            style={{ animation: "mcwv-row-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <div className="flex items-center justify-between bg-violet-500/15 px-6 py-3">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-violet-300">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] ${heroMeta.chip}`}
                >
                  {heroMeta.icon} {heroMeta.label}
                </span>
                <span>· From your notification</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setHighlightId(null);
                  history.replaceState(null, "", "/notifications");
                }}
                className="text-xs font-semibold text-zinc-400 transition hover:text-white"
              >
                close ✕
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
                  className="max-h-72 w-full border-b border-violet-400/20 object-cover transition hover:opacity-95"
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
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                  {hero.body}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {heroCta ? (
                  <a
                    href={heroCta.href}
                    onClick={() => void markRead(hero.id)}
                    className="rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                  >
                    {heroCta.label} →
                  </a>
                ) : null}
                {officer ? (
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
                ) : null}
              </div>

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
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-400/50"
                    />
                    <button
                      type="button"
                      disabled={imageBusy}
                      onClick={() => void saveImage(imageInput.trim() || null)}
                      className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {imageBusy ? "Saving…" : "Save"}
                    </button>
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
                {loadError} Your alerts aren&apos;t gone — this is a hiccup, not an empty
                inbox.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                className="mt-4 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                ↻ Retry
              </button>
            </div>
          ) : visible.length === 0 && !hero ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
              <p className="text-4xl">{emptyCopy.icon}</p>
              <p className="mt-3 text-sm font-semibold text-zinc-300">{emptyCopy.title}</p>
              <p className="mt-1 text-sm text-zinc-500">{emptyCopy.sub}</p>
              {filter === "all" ? (
                <a
                  href="/settings"
                  className="mt-4 inline-block rounded-2xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-xs font-bold text-violet-200 transition hover:bg-violet-400/15"
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
              {dayGroups.map((group, gi) => (
                <div key={`${group.label}-${gi}`} className="space-y-2">
                  {sectionHeader(group.label)}
                  <div className="space-y-2">
                    {group.rows.map((item, i) =>
                      renderRow(item, newItems.length + gi * 3 + i)
                    )}
                  </div>
                </div>
              ))}
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
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            void refreshNow();
          }}
          style={{
            animation: "mcwv-row-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_40px_rgba(139,92,246,0.55)] transition hover:-translate-y-0.5 hover:opacity-95"
        >
          {refreshing
            ? "Loading new alerts…"
            : `🔔 ${pendingNew} new alert${pendingNew === 1 ? "" : "s"} — tap to view`}
        </button>
      ) : null}
    </main>
  );
}
