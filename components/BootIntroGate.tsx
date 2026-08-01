"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import CutsceneStage from "./CutsceneStage";

/**
 * Boot intro gate — plays the MCWV cutscene once per browser session,
 * covering whatever page loads, then routes by auth state:
 *   signed out → /signup (account creation first, per clan flow)
 *   signed in  → / (home)
 * Repeat loads in the same session skip it via sessionStorage + a pre-paint
 * <html data-intro-done> flag set by the tiny head script in app/layout.tsx,
 * so returning visitors never even flash the intro.
 * Fires "mcwv:intro-done" when the site is revealed — pop-ups
 * (WarReturnRecap / OnboardingTour) wait for that before opening.
 */
const INTRO_KEY = "mcwv_intro_seen_v1";
const SKIP_PATHS = new Set(["/cutscene"]);

export default function BootIntroGate() {
  const pathname = usePathname();
  const router = useRouter();
  // Optimistically shown (it is server-rendered so the intro starts at first
  // paint); the head-script attribute hides it for repeat visitors.
  const [show, setShow] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "1";
    } catch {
      seen = false;
    }

    if (seen || SKIP_PATHS.has(pathname)) {
      setShow(false);
      window.dispatchEvent(new Event("mcwv:intro-done"));
    }
  }, [pathname]);

  // Lock page scroll while the intro covers everything.
  useEffect(() => {
    if (!show) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [show]);

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    setLeaving(true);
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // storage unavailable (private mode) — intro replays next load, harmless
    }
    window.dispatchEvent(new Event("mcwv:intro-done"));

    // Route by auth state under the still-opaque overlay, then fade.
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const user = data?.user ?? null;
        const destination = user ? "/" : "/signup";
        if (window.location.pathname !== destination) {
          router.replace(destination);
        }
      })
      .catch(() => {
        // network hiccup — just reveal whatever page is underneath
      })
      .finally(() => {
        window.setTimeout(() => setShow(false), 500);
      });
  }, [router]);

  if (!show) return null;

  return (
    <div className={`cs-loader${leaving ? " cs-loader-leaving" : ""}`} role="presentation">
      <CutsceneStage mode="loader" onSkip={finish} onFinish={finish} />
    </div>
  );
}
