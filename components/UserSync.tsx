"use client";

import { useEffect, useState } from "react";

type User = {
  id: number;
  username: string;
  theme?: string | null;
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
   * Session watchdog (27 Sep 2026) — completes "sign out everywhere".
   * While THIS tab has seen a real login (armed), any later check that says
   * logged out — confirmed by a clean 200, never a hiccup — bounces to
   * /login so revoked devices visibly log out instead of sitting in limbo.
   * Cadence: every 10s in the foreground, and instantly when a hidden tab
   * becomes visible again (phone wakes -> bounce in ~1s). Auth pages are
   * never watched (no bounce loops). Server errors / network drops NEVER
   * log anyone out: same fail-open doctrine as everywhere else here.
   */
  useEffect(() => {
    let armed = false;
    let inflight = false;

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

    const check = async () => {
      if (inflight || onAuthPage()) return;
      inflight = true;
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return; // hiccup: change nothing at all
        let data: { user?: unknown } | null;
        try {
          data = await res.json();
        } catch {
          return; // 200 with an unparseable body is noise too - never bounce on it
        }
        if (data?.user) {
          armed = true;
        } else if (armed) {
          window.location.href = "/login?reason=signed-out";
        }
      } catch {
        /* network blip: never bounce on noise */
      } finally {
        inflight = false;
      }
    };

    void check();
    const every = window.setInterval(check, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
