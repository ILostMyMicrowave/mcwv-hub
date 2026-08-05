"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import CutsceneStage from "./CutsceneStage";

/**
 * Boot intro gate — plays the MCWV cutscene ONCE PER DEVICE, covering
 * whatever page loads, then gets out of the way.
 *
 * Memory: localStorage (survives browser restarts). The old sessionStorage
 * memory made the intro replay on every cold start / fresh tab — on mobile
 * that's nearly every visit. Legacy session values are promoted on read so
 * existing sessions never get one last surprise replay. The pre-paint
 * <html data-intro-done> flag set by the head script in app/layout.tsx
 * (checking both stores) keeps repeat loads from even flashing the intro.
 *
 * Deep links win: finish() NEVER navigates a signed-in member — tapping a
 * /war-info link means landing on /war-info. The only redirect left is the
 * clan-flow nudge: a signed-out visitor sitting on /login is pointed at
 * /signup (account creation first). All other auth routing belongs to
 * proxy.ts, which redirects cookieless visitors to /login?next=… up front.
 *
 * Fires "mcwv:intro-done" when the site is revealed — pop-ups
 * (WarReturnRecap / OnboardingTour) wait for that before opening.
 */
const INTRO_KEY = "mcwv_intro_seen_v1";
const SKIP_PATHS = new Set(["/cutscene"]);

function readIntroSeen(): boolean {
  try {
    if (localStorage.getItem(INTRO_KEY) === "1") return true;
  } catch {
    // storage blocked — fall through
  }
  try {
    if (sessionStorage.getItem(INTRO_KEY) === "1") {
      // Promote legacy session-only memory so it survives browser restarts.
      try {
        localStorage.setItem(INTRO_KEY, "1");
      } catch {
        // promotion is best-effort
      }
      return true;
    }
  } catch {
    // storage blocked — treat as unseen (intro replays, harmless)
  }
  return false;
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    // storage unavailable (private mode) — intro replays next load, harmless
  }
  try {
    sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    // same
  }
}

export default function BootIntroGate() {
  const pathname = usePathname();
  const router = useRouter();
  // Optimistically shown (it is server-rendered so the intro starts at first
  // paint); the head-script attribute hides it for repeat visitors.
  const [show, setShow] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    if (readIntroSeen() || SKIP_PATHS.has(pathname)) {
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
    markIntroSeen();
    window.dispatchEvent(new Event("mcwv:intro-done"));

    // Deep-link safety: only ever redirect a signed-out visitor off /login.
    // Signed-in members stay exactly where they intended to be.
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const user = data?.user ?? null;
        if (!user && window.location.pathname === "/login") {
          router.replace("/signup");
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
