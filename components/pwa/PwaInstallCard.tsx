"use client";

import { useEffect, useState } from "react";
import {
  APP_INSTALLED_EVENT,
  INSTALL_READY_EVENT,
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";

// iOS Safari exposes window.navigator.standalone.
type IosNavigator = Navigator & { standalone?: boolean };

export default function PwaInstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const nav = navigator as IosNavigator;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      window.matchMedia?.("(display-mode: minimal-ui)")?.matches === true ||
      nav.standalone === true ||
      window.__mcwvAppInstalled === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onInstallReady = () => {
      setDeferredPrompt(getDeferredInstallPrompt());
    };
    const onInstalled = () => {
      clearDeferredInstallPrompt();
      setInstalled(true);
      setDeferredPrompt(null);
    };

    // The root layout has already captured the one-shot Chromium event, even
    // when this Settings card mounts later during client-side navigation.
    window.addEventListener(INSTALL_READY_EVENT, onInstallReady);
    window.addEventListener(APP_INSTALLED_EVENT, onInstalled);
    setDeferredPrompt(getDeferredInstallPrompt());

    return () => {
      window.removeEventListener(INSTALL_READY_EVENT, onInstallReady);
      window.removeEventListener(APP_INSTALLED_EVENT, onInstalled);
    };
  }, []);

  async function install() {
    const prompt = deferredPrompt ?? getDeferredInstallPrompt();
    if (!prompt) return;

    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Fall through to the always-visible manual instructions below.
    } finally {
      // A deferred prompt is single-use whether accepted, dismissed, or
      // rejected by the browser.
      clearDeferredInstallPrompt(prompt);
      setDeferredPrompt(null);
      setBusy(false);
    }
  }

  if (installed) {
    return (
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
        <p className="text-sm font-bold text-emerald-200">✅ Installed</p>
        <p className="mt-1 text-sm text-emerald-100/70">
          You&apos;re running MCWV Hub as an app — straight from your home
          screen, no browser chrome.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">📲 Install the app</p>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Add MCWV Hub to your home screen — full-screen launch, app icon,
            buttery page transitions. The icon even gets a 🔴 dot when a war
            is live.
          </p>
        </div>
        {deferredPrompt ? (
          <button
            type="button"
            onClick={() => void install()}
            disabled={busy}
            className="shrink-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Installing…" : "📲 Install MCWV Hub"}
          </button>
        ) : isIos ? (
          <button
            type="button"
            onClick={() => setShowIosSteps((v) => !v)}
            className="shrink-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:opacity-90"
          >
            📲 How to install
          </button>
        ) : (
          <div className="max-w-sm shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-400">
            <p>
              Browser menu →{" "}
              <span className="font-semibold text-zinc-200">Install app</span>,{" "}
              <span className="font-semibold text-zinc-200">Add to Home Screen</span>, or{" "}
              <span className="font-semibold text-zinc-200">Add to Dock</span>
            </p>
            <p className="mt-1.5 text-zinc-500">
              No install option? Open MCWV Hub in Chrome or Edge on desktop/Android,
              or Safari on an Apple device.
            </p>
          </div>
        )}
      </div>

      {isIos && showIosSteps && !deferredPrompt ? (
        <ol className="mt-4 list-decimal space-y-1.5 rounded-2xl border border-white/10 bg-white/5 p-4 pl-9 text-sm text-zinc-300">
          <li>
            Open this page in{" "}
            <span className="font-semibold text-white">Safari</span>
          </li>
          <li>
            Tap the <span className="font-semibold text-white">Share</span>{" "}
            button (square with arrow ↑)
          </li>
          <li>
            Scroll down and tap{" "}
            <span className="font-semibold text-white">Add to Home Screen</span>
          </li>
          <li>
            Tap <span className="font-semibold text-white">Add</span> — done 🎉
          </li>
        </ol>
      ) : null}
    </div>
  );
}
