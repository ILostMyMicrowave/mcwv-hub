"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type IosNavigator = Navigator & { standalone?: boolean };

const VISIT_KEY = "mcwv-visits";
const DISMISS_KEY = "mcwv-install-dismissed";
const SNOOZE_DAYS = 7;
const MIN_VISITS = 3;

// Hide on pages where an install banner would be jarring.
const HIDDEN_PREFIXES = ["/admin", "/login", "/signup", "/cutscene"];

function isStandalone() {
  const nav = navigator as IosNavigator;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)")?.matches === true ||
    nav.standalone === true
  );
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [show, setShow] = useState(false);
  const [warActive, setWarActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    // Track visit count
    let visits = 0;
    try {
      visits = parseInt(localStorage.getItem(VISIT_KEY) || "0", 10) + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
    } catch {
      visits = 99; // if localStorage fails, just show it
    }

    // Check snooze
    let snoozed = false;
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
        if (daysSince < SNOOZE_DAYS) snoozed = true;
      }
    } catch {
      // if localStorage fails, don't snooze
    }

    if (visits >= MIN_VISITS && !snoozed) {
      // Small delay so it slides in after page load
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }

    // Listen for the install prompt event (Chrome/Edge/Android)
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      // If we haven't shown yet but the browser is ready, show now
      // (but still respect the snooze)
      if (!snoozed && visits >= 1) {
        setTimeout(() => setShow(true), 1500);
      }
    };
    const onInstalled = () => {
      setInstalled(true);
      setShow(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Check war status for urgency messaging
  useEffect(() => {
    if (!show) return;
    async function checkWar() {
      try {
        const res = await fetch("/api/app-status", { cache: "no-store" });
        const data = await res.json();
        if (data.warActive) {
          setWarActive(true);
        }
      } catch {
        // best-effort
      }
    }
    void checkWar();
    return () => {};
  }, [show]);

  function snooze() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // best-effort
    }
    setShow(false);
  }

  async function install() {
    if (deferredPrompt) {
      setBusy(true);
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
          setShow(false);
        }
      } finally {
        setBusy(false);
      }
    } else if (isIos) {
      // iOS doesn't support beforeinstallprompt — scroll to settings where
      // the full iOS install instructions are
      window.location.href = "/settings#install";
    }
  }

  if (installed || !show) return null;

  // Hide on auth/admin/cutscene pages.
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  const urgency = warActive;
  const headline = urgency
    ? "⚔️ War is live — install for instant alerts"
    : "📲 Install MCWV Hub as an app";
  const subtext = urgency
    ? "Get push notifications the moment wars start, placements change, or you're on the slacker list."
    : "Add to your home screen for full-screen launch, app icon, and a live war badge.";

  return (
    <>
      {/* Backdrop — non-blocking, just dims slightly */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.3)",
          opacity: show ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      {/* Banner */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 transition-transform duration-300 ease-out"
        style={{
          transform: show ? "translateY(0)" : "translateY(120%)",
        }}
      >
        <div
          className="mx-auto max-w-lg overflow-hidden rounded-3xl border backdrop-blur-xl"
          style={{
            borderColor: urgency
              ? "color-mix(in srgb, var(--primary) 35%, var(--border))"
              : "color-mix(in srgb, #7c3aed 30%, var(--border))",
            background: "color-mix(in srgb, #09090b 90%, #7c3aed)",
            boxShadow: urgency
              ? "0 -4px 30px color-mix(in srgb, var(--primary) 15%, transparent), 0 -1px 4px rgba(0,0,0,0.3)"
              : "0 -4px 30px rgba(124,58,237,0.2), 0 -1px 4px rgba(0,0,0,0.3)",
          }}
        >
          {/* Top accent line */}
          <div
            className="h-1"
            style={{
              background: urgency
                ? "linear-gradient(90deg, var(--primary), var(--accent), var(--primary))"
                : "linear-gradient(90deg, #7c3aed, #ec4899, #7c3aed)",
            }}
          />

          <div className="flex items-center gap-4 p-5">
            {/* Icon */}
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl"
              style={{
                background: urgency
                  ? "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 50%, #7c3aed))"
                  : "linear-gradient(135deg, #7c3aed, #ec4899)",
                boxShadow: urgency
                  ? "0 0 16px color-mix(in srgb, var(--primary) 30%, transparent)"
                  : "0 0 16px rgba(124,58,237,0.3)",
              }}
            >
              {urgency ? "⚔️" : "📲"}
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{headline}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{subtext}</p>
            </div>

            {/* Buttons */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void install()}
                disabled={busy}
                className="rounded-xl px-4 py-2.5 text-sm font-bold transition hover:scale-[1.03] active:scale-95 disabled:opacity-60"
                style={{
                  background: urgency
                    ? "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #7c3aed))"
                    : "linear-gradient(135deg, #7c3aed, #ec4899)",
                  color: "#000",
                }}
              >
                {busy ? "…" : "Install"}
              </button>
              <button
                type="button"
                onClick={snooze}
                className="rounded-xl px-3 py-2.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
