"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  APP_INSTALLED_EVENT,
  INSTALL_READY_EVENT,
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";

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
  const [show, setShow] = useState(false);
  const [warActive, setWarActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (isStandalone() || window.__mcwvAppInstalled === true) {
      setInstalled(true);
      return;
    }

    // Track visit count.
    let visits = 0;
    try {
      visits = parseInt(localStorage.getItem(VISIT_KEY) || "0", 10) + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
    } catch {
      visits = 99; // if localStorage fails, just show it
    }

    // Check snooze.
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

    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const reveal = () => {
      if (showTimer !== null) return;
      // Small delay so the banner slides in after page load.
      showTimer = setTimeout(() => setShow(true), 1500);
    };

    const onInstallReady = () => {
      setDeferredPrompt(getDeferredInstallPrompt());
      // The browser is ready, so the banner may appear from the first visit.
      if (!snoozed && visits >= 1) reveal();
    };
    const onInstalled = () => {
      clearDeferredInstallPrompt();
      setInstalled(true);
      setShow(false);
      setDeferredPrompt(null);
    };

    // The root-layout script captures beforeinstallprompt before hydration.
    // Always register these listeners, including on the normal 3-visit path.
    window.addEventListener(INSTALL_READY_EVENT, onInstallReady);
    window.addEventListener(APP_INSTALLED_EVENT, onInstalled);

    const capturedPrompt = getDeferredInstallPrompt();
    setDeferredPrompt(capturedPrompt);
    if (!snoozed && (visits >= MIN_VISITS || capturedPrompt !== null)) {
      reveal();
    }

    return () => {
      if (showTimer !== null) clearTimeout(showTimer);
      window.removeEventListener(INSTALL_READY_EVENT, onInstallReady);
      window.removeEventListener(APP_INSTALLED_EVENT, onInstalled);
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
    const prompt = deferredPrompt ?? getDeferredInstallPrompt();
    if (!prompt) {
      // There is no standards-based way to force the native dialog in browsers
      // that do not expose beforeinstallprompt. Never leave a dead button:
      // send the user to device-specific, actionable instructions instead.
      window.location.href = "/settings#install";
      return;
    }

    setBusy(true);
    let promptFailed = false;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;

      // beforeinstallprompt objects can only be used once, including after a
      // dismissal. Clear this exact object without clobbering a newer event.
      clearDeferredInstallPrompt(prompt);
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") setShow(false);
    } catch {
      clearDeferredInstallPrompt(prompt);
      setDeferredPrompt(null);
      promptFailed = true;
    } finally {
      setBusy(false);
    }

    if (promptFailed) window.location.href = "/settings#install";
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

          <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
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
            <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => void install()}
                disabled={busy}
                className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition hover:scale-[1.03] active:scale-95 disabled:opacity-60 sm:flex-none"
                style={{
                  background: urgency
                    ? "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #7c3aed))"
                    : "linear-gradient(135deg, #7c3aed, #ec4899)",
                  color: "#000",
                }}
              >
                {busy ? "…" : deferredPrompt ? "Install" : "How to install"}
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
