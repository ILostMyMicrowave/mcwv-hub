"use client";

import { useEffect, useState } from "react";

/*
 * Home ticker (optional card from the slice-B plan): a one-line strip under
 * the landing header showing the PINNED announcement, for signed-in members
 * only. Deliberately dumb: one client fetch of the feed API, renders nothing
 * unless the answer is a live pinned post, never blocks or breaks the page —
 * if the hub's DB is sad, the strip just isn't there.
 */
export default function AnnouncementTicker() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/announcements", { cache: "no-store" });
        if (dead) return;
        if (!res.ok) {
          setText(null);
          return;
        }
        const data = await res.json().catch(() => null);
        const top = data?.feed?.[0];
        setText(top && top.pinned && !top.scheduled ? String(top.body).split("\n")[0].slice(0, 140) : null);
      } catch {
        if (!dead) setText(null);
      }
    };
    void pull();
    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!text) return null;
  return (
    <a
      href="/announcements"
      className="mx-auto mb-3 flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.08] px-4 py-2 text-[13px] text-[var(--foreground)] transition hover:bg-[var(--accent)]/[0.14]"
    >
      <span aria-hidden>📌</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <span className="shrink-0 text-[var(--foreground)]/60">view →</span>
    </a>
  );
}
