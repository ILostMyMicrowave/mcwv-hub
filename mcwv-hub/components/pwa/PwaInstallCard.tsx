"use client";

import { useEffect, useState } from "react";

// Minimal type for the non-standard beforeinstallprompt event (Chromium).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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
      nav.standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onBeforeInstall = (event: Event) => {
      // Stop the mini-infobar and stash the event so our own button can
      // trigger the native prompt whenever the user is ready.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } finally {
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
          <p className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-400">
            Browser menu →{" "}
            <span className="font-semibold text-zinc-200">Install app</span> /{" "}
            <span className="font-semibold text-zinc-200">
              Add to Home Screen
            </span>
          </p>
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
