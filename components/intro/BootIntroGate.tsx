"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import IntroStage from "./IntroStage";
import {
  INTRO_SESSION_KEY,
  markIntroDone,
  mcwvIntroIsDone,
} from "@/lib/introDone";

type MeResponse = { user?: unknown };

/**
 * MCWV boot intro gate — mounted once in the root layout.
 *
 * Behaviour:
 *  - Plays the 6s cutscene over the very first page load of each session.
 *  - Once per session (sessionStorage `mcwv_intro_seen_v1`) — repeat loads skip
 *    it instantly (the layout head script hides us before first paint).
 *  - Respects prefers-reduced-motion: never plays.
 *  - On finish/skip, routes by auth state:
 *      signed OUT → /signup   ·   signed IN → / (home)
 *  - Marks `mcwv:intro-done` so welcome-back popups wait for the reveal.
 *
 * SSR note: we always render the overlay (initial state `show=true`) so it is
 * part of the very first HTML for first-time visitors — no content flash.
 * Repeat visitors are hidden pre-paint via `html[data-intro-done] .cs-gate`,
 * then this component unmounts itself in an effect.
 */
export default function BootIntroGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(true);
  const [closing, setClosing] = useState(false);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const authRef = useRef<Promise<boolean> | null>(null);
  const prevOverflowRef = useRef("");
  const timersRef = useRef<number[]>([]);
  const finishingRef = useRef(false);

  useEffect(() => {
    let sessionSeen = false;
    try {
      sessionSeen = sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    } catch {}
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (mcwvIntroIsDone() || sessionSeen || reducedMotion) {
      // Not playing — unlock any waiting popups immediately.
      setShow(false);
      markIntroDone();
      return;
    }

    // Lock page scroll while the intro owns the screen.
    prevOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Resolve auth in the background — the intro runs ~6s, plenty of time.
    authRef.current = fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MeResponse | null) => Boolean(data?.user))
      .catch(() => false);

    // Natural finish: just after the stage's own 6.0s outro fires.
    timersRef.current.push(
      window.setTimeout(() => {
        void handleFinish(false);
      }, 6050)
    );

    return () => {
      document.body.style.overflow = prevOverflowRef.current;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFinish(skipped: boolean) {
    if (finishingRef.current) return;
    finishingRef.current = true;

    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {}
    markIntroDone();

    if (skipped) setClosing(true); // fast fade; natural end fades via CSS at 6.02s

    // Route by auth state:
    //   signed OUT → /signup (they can't access pages anyway)
    //   signed IN  → / (home)
    const signedIn = authRef.current ? await authRef.current : false;
    const currentPath = pathnameRef.current;
    if (!signedIn) {
      if (currentPath !== "/signup") router.push("/signup");
    } else if (currentPath !== "/") {
      router.push("/");
    }

    document.body.style.overflow = prevOverflowRef.current;
    timersRef.current.push(
      window.setTimeout(() => setShow(false), skipped ? 340 : 700)
    );
  }

  if (!show) return null;

  return (
    <div className={`cs-gate${closing ? " cs-gate-closing" : ""}`} role="presentation">
      <IntroStage onSkip={() => void handleFinish(true)} />
    </div>
  );
}
