"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Global site gate: every member must connect their PS99 account (via BIG
// Games OAuth) before using the hub. Staff are included too. Public pages
// (login, signup) and the profile page (where you connect) are exempt so the
// connect flow itself stays reachable.
//
// If the server hasn't been configured for BIG Games yet (no client id/secret),
// the gate stays OFF so the site never locks itself behind a misconfigured
// feature.

const EXEMPT_PATHS = ["/login", "/signup", "/profile/me", "/privacy", "/terms"];

function isExempt(pathname: string) {
  // login/signup are public; /profile/me is where you connect; legal pages
  // must always be readable even if not connected.
  if (pathname === "/login" || pathname === "/signup") return true;
  if (pathname === "/profile/me") return true;
  if (pathname === "/privacy" || pathname === "/terms") return true;
  return false;
}

export default function BigGamesGate() {
  const pathname = usePathname() ?? "";
  const [state, setState] = useState<{
    loading: boolean;
    authenticated: boolean;
    connected: boolean;
    configured: boolean;
  }>({ loading: true, authenticated: false, connected: false, configured: false });

  useEffect(() => {
    let alive = true;
    // Only gate logged-in users. If /api/biggames/status returns 401, the
    // user isn't authenticated and the page will redirect to /login itself.
    //
    // Keyed on `pathname` so navigating between pages re-validates auth /
    // connection (e.g. after logging in or connecting on /profile/me). We
    // deliberately do NOT flip back to `loading` on a re-run — the previous
    // state stays visible until the fresh data arrives, which avoids the gate
    // flashing over the screen during a client-side navigation.
    Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/biggames/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([me, bg]) => {
      if (!alive) return;
      setState((prev) => ({
        loading: false,
        authenticated: Boolean(me?.user?.id),
        connected: Boolean(bg?.connected),
        configured: Boolean(bg?.configured),
      }));
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  // Not a member page, or still loading, or server not configured, or the user
  // isn't logged in (login redirect handles it).
  if (isExempt(pathname) || state.loading || !state.configured || !state.authenticated) return null;

  // Connected — no gate.
  if (state.connected) return null;

  // Not connected — block the site.
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-3xl border border-violet-400/30 bg-gradient-to-b from-violet-500/10 to-transparent p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-violet-400/40 bg-violet-500/20 text-3xl">
          🔒
        </div>
        <h1 className="mt-5 text-2xl font-black text-white">Connect your PS99 account</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          MCWV requires every member to authorize the clan app so we can see live
          gem counts, inventory and extended stats. It only reads your data — we
          never see your password.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <a
            href="/api/biggames/authorize"
            className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
          >
            Connect with BIG Games
          </a>
          <a
            href="/profile/me"
            className="text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            Already connected? Go to my profile
          </a>
        </div>
        <p className="mt-5 text-[11px] text-zinc-500">
          Authorizing is safe and instant — you&apos;ll be back in seconds.
        </p>
      </div>
    </div>
  );
}
