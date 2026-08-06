"use client";

import Navbar from "@/components/Navbar";
import { useCallback, useEffect, useState } from "react";

type HubNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
};

const TYPE_ICON: Record<string, string> = {
  war: "⚔️",
  presence: "🎮",
  broadcast: "📢",
  test: "🔔",
};

function iconFor(type: string) {
  return TYPE_ICON[type] ?? "🔔";
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<HubNotification[]>([]);
  const [lastReadId, setLastReadId] = useState(0);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json()) as {
        notifications?: HubNotification[];
        lastReadId?: number;
      };
      setItems(data.notifications ?? []);
      setLastReadId(Number(data.lastReadId ?? 0));

      const param = Number(new URLSearchParams(window.location.search).get("n"));
      if (Number.isFinite(param) && param > 0) {
        setHighlightId(param);
      }
    } catch {
      // Empty inbox state renders below.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const unreadCount = items.filter((item) => item.id > lastReadId).length;
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
    history.replaceState(null, "", `/notifications?n=${item.id}`);
  }

  const listItems = hero ? items.filter((item) => item.id !== hero.id) : items;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <Navbar />
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-400">
              MCWV Alerts
            </p>
            <h1 className="mt-1 text-4xl font-black text-white sm:text-5xl">
              Inbox
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              War pings, broadcasts, and nudges — newest first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <span className="rounded-full border border-violet-400/40 bg-violet-400/15 px-3 py-1.5 text-xs font-bold text-violet-200">
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

        {hero ? (
          <section className="mt-6 overflow-hidden rounded-3xl border border-violet-400/35 bg-gradient-to-b from-violet-500/[0.12] to-transparent shadow-[0_0_50px_rgba(124,58,237,0.18)]">
            <div className="flex items-center justify-between bg-violet-500/15 px-6 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-300">
                From your notification
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
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-2xl">
                  {iconFor(hero.type)}
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-black leading-tight text-white">
                    {hero.title}
                  </h2>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {formatWhen(hero.createdAt)}
                  </p>
                </div>
              </div>
              {hero.body ? (
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                  {hero.body}
                </p>
              ) : null}
              {hero.url ? (
                <a
                  href={hero.url}
                  onClick={() => void markRead(hero.id)}
                  className="mt-5 inline-block rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                >
                  Open page →
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="mt-6 space-y-2">
          {loading ? (
            <p className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-zinc-500">
              Loading alerts…
            </p>
          ) : listItems.length === 0 && !hero ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
              <p className="text-4xl">📭</p>
              <p className="mt-3 text-sm font-semibold text-zinc-300">
                Nothing here yet
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                War declarations, broadcasts, and nudges will land in this
                inbox.
              </p>
            </div>
          ) : (
            listItems.map((item) => {
              const isNew = item.id > lastReadId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openAlert(item)}
                  className={`flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${
                    isNew
                      ? "border-violet-400/25 bg-violet-400/[0.07] hover:bg-violet-400/[0.12]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-xl">
                    {iconFor(item.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-white">
                        {item.title}
                      </span>
                      {isNew ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                      ) : null}
                    </span>
                    {item.body ? (
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">
                        {item.body}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                      {formatWhen(item.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-zinc-600">›</span>
                </button>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
