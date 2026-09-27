"use client";

import { useEffect, useState } from "react";

type User = {
  id: number;
  username: string;
  theme?: string | null;
  sid?: string | null;
} | null;

const THEMES = new Set(["default", "ice", "inferno"]);

function safeTheme(value: string | null | undefined) {
  return value && THEMES.has(value) ? value : "default";
}

export default function UserSync() {
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    const rawSaved = localStorage.getItem("mcwv-theme");
    const savedTheme = safeTheme(rawSaved);

    if (rawSaved) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }

    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        const nextUser: User = data?.user ?? null;

        setUser(nextUser);

        if (!rawSaved) {
          const theme = safeTheme(nextUser?.theme);

          document.documentElement.setAttribute("data-theme", theme);
          localStorage.setItem("mcwv-theme", theme);
        }
      } catch {
        if (!rawSaved) {
          document.documentElement.setAttribute("data-theme", "default");
          localStorage.setItem("mcwv-theme", "default");
        }
      }
    }

    load();
  }, []);

  /*
   * Sign-out delivery v2 (27 Sep 2026) — two paths, one outcome: a revoked
   * device ENDS at the login screen, visibly.
   *
   *  1. PRIMARY (instant): the kick push wakes the service worker even when
   *     this app is frozen/backgrounded; the worker posts {type:"mcwv-kick"}
   *     to every page. A message naming OUR OWN sid came from this device
   *     ("sign out everywhere" pressed here) -> ignored, never self-bounce.
   *     Any other kick -> fly to /login immediately.
   *  2. FALLBACK (no push: plain browser tab, iOS before PWA install, dead
   *     worker): the watchdog re-checks /api/auth/me — every 30s foreground,
   *     instantly on wake/visibility. The server answers dead within ~3s of
   *     a revoke (sid cache TTL), so worst case a pushless device bounces
   *     within one visibility beat.
   *
   * Doctrine unchanged: hiccups NEVER log anyone out (only a clean 200 with
   * user:null counts), auth pages are never watched, and every listener is
   * uninstalled on cleanup.
   */
  useEffect(() => {
    let armed = false;
    let inflight = false;
    let mySid: string | null = null;

    const onAuthPage = () => {
      const p = window.location.pathname;
      return (
        p === "/login" ||
        p.startsWith("/login/") ||
        p.startsWith("/signup") ||
        p.startsWith("/forgot-password") ||
        p.startsWith("/reset-password")
      );
    };

    const bounce = () => {
      if (onAuthPage()) return;
      window.location.href = "/login?reason=signed-out";
    };

    const check = async () => {
      if (inflight || onAuthPage()) return;
      inflight = true;
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return; // hiccup: change nothing at all
        let data: { user?: { sid?: string | null } | null } | null;
        try {
          data = await res.json();
        } catch {
          return; // 200 with an unparseable body is noise too - never bounce on it
        }
        if (data?.user) {
          armed = true;
          if (typeof data.user.sid === "string") mySid = data.user.sid;
        } else if (armed) {
          bounce();
        }
      } catch {
        /* network blip: never bounce on noise */
      } finally {
        inflight = false;
      }
    };

    const onSwMessage = (event: MessageEvent) => {
      const d = event.data as { type?: string; sid?: string | null } | null;
      if (!d || d.type !== "mcwv-kick") return;
      if (d.sid && mySid && d.sid === mySid) return; // revoker's own device
      // Page-side bounce is THE reliable navigation (worker navigate() is
      // not trusted on all builds) — and re-ask the server first only when
      // we never saw a healthy me: a kick is server-authorized, so when this
      // tab DID see a login, trust it and move.
      if (armed) bounce();
      else void check().then(() => undefined);
    };

    void check();
    const every = window.setInterval(check, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const sw = navigator.serviceWorker;
    sw?.addEventListener("message", onSwMessage as EventListener);
    return () => {
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      sw?.removeEventListener("message", onSwMessage as EventListener);
    };
  }, []);

  return null;
}
