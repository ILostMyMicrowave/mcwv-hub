"use client";

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

function parseHash(): number | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#n=(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * In-app alert popup. Push notifications carry a URL ending in #n=<id>;
 * whenever that hash is present this fetches the logged alert and shows it
 * in a modal, plus a mini-menu of recent alerts below. Renders nothing
 * otherwise — zero impact on normal browsing.
 */
export default function NotificationCenter() {
  const [current, setCurrent] = useState<HubNotification | null>(null);
  const [recent, setRecent] = useState<HubNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openFromHash = useCallback(async () => {
    const id = parseHash();
    if (!id) return;
    try {
      const res = await fetch(`/api/notifications/${id}`, { cache: "no-store" });
      if (res.status === 401) {
        setCurrent(null);
        setError("Log in to view this alert.");
        return;
      }
      if (!res.ok) {
        setCurrent(null);
        setError("That alert couldn't be found.");
        return;
      }
      const data = (await res.json()) as { notification: HubNotification };
      setError(null);
      setCurrent(data.notification);

      const listRes = await fetch("/api/notifications", { cache: "no-store" });
      if (listRes.ok) {
        const list = (await listRes.json()) as { notifications: HubNotification[] };
        setRecent(list.notifications.filter((n) => n.id !== id).slice(0, 8));
      }
    } catch {
      setCurrent(null);
      setError("Couldn't load that alert.");
    }
  }, []);

  useEffect(() => {
    // The hash arrives from an external system (push tap / browser), so it
    // can only be read post-mount — never during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void openFromHash();
    const onHash = () => {
      if (parseHash() === null) {
        setCurrent(null);
        setError(null);
        return;
      }
      void openFromHash();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [openFromHash]);

  function close() {
    setCurrent(null);
    setError(null);
    if (parseHash() !== null) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function pick(item: HubNotification) {
    setError(null);
    setCurrent(item);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#n=${item.id}`);
  }

  const open = Boolean(current) || Boolean(error);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-violet-400/25 bg-[#0b0b0e]/95 shadow-[0_0_60px_rgba(124,58,237,0.25)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="MCWV alert"
      >
        <div className="bg-gradient-to-r from-violet-500/25 via-fuchsia-500/10 to-transparent px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-300">
              MCWV Alert
            </p>
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-zinc-300 transition hover:bg-white/10"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {error ? (
            <p className="text-sm text-zinc-300">{error}</p>
          ) : current ? (
            <>
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-2xl">
                  {iconFor(current.type)}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-black leading-tight text-white">
                    {current.title}
                  </h3>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {formatWhen(current.createdAt)}
                  </p>
                </div>
              </div>
              {current.body ? (
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                  {current.body}
                </p>
              ) : null}
              <div className="mt-5 flex items-center gap-2">
                {current.url ? (
                  <a
                    href={current.url}
                    onClick={close}
                    className="rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                  >
                    Open page →
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : null}
        </div>

        {recent.length > 0 ? (
          <div className="border-t border-white/10 px-4 py-3">
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              Recent alerts
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/5"
                  >
                    <span className="text-lg">{iconFor(item.type)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-200">
                        {item.title}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        {formatWhen(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
