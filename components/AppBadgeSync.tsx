"use client";

import { useEffect } from "react";

// Minimal Badging API surface (not yet in all TS DOM libs).
type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

const POLL_MS = 5 * 60 * 1000;

/**
 * Renders nothing. While the app is open it keeps the home-screen icon badge
 * honest: 🔴 dot whenever a clan battle is live, clear when it isn't.
 * Polls /api/app-status every 5 min and whenever the tab regains focus.
 * Silently no-ops on browsers without the Badging API.
 */
export default function AppBadgeSync() {
  useEffect(() => {
    // Kick the push service worker to self-update on every app open.
    // Browsers only check for worker updates on their own ~daily schedule,
    // so without this, a fixed push-sw.js sits live on the server but
    // dormant on devices. Once the new script is seen, the worker's own
    // skipWaiting + clients.claim() swap it in immediately.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
    }

    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function") return;

    let dead = false;

    async function tick() {
      try {
        const res = await fetch("/api/app-status", { cache: "no-store" });
        const data = (await res.json()) as { warActive?: boolean };
        if (dead) return;
        if (data.warActive) {
          await nav.setAppBadge!(1).catch(() => undefined);
        } else if (typeof nav.clearAppBadge === "function") {
          await nav.clearAppBadge().catch(() => undefined);
        }
      } catch {
        // Never surface badge errors to the user.
      }
    }

    void tick();
    const interval = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dead = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
