"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

type MeState = {
  loading: boolean;
  error: string | null;
  username: string;
  role: string;
  keyPreview: string | null;
  hasKey: boolean;
};

type VersionInfo = {
  version: string;
  changelog?: Record<string, string>;
};

export default function MacrosPage() {
  const [me, setMe] = useState<MeState>({ loading: true, error: null, username: "", role: "member", keyPreview: null, hasKey: false });
  const [downloading, setDownloading] = useState(false);
  const [gate, setGate] = useState<"none" | "login">("none");
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [isFromLauncher, setIsFromLauncher] = useState(false);

  const load = useCallback(async () => {
    setMe((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/macro-me", { cache: "no-store" });
      if (res.status === 401) {
        setGate("login");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const sres = await fetch("/api/app-status", { cache: "no-store" });
        const sdata = await sres.json().catch(() => null);
        if (!sdata?.authenticated) {
          setGate("login");
          return;
        }
        setMe({
          loading: false,
          error: data?.error || null,
          username: sdata?.user?.username ?? "",
          role: sdata?.user?.role ?? "member",
          keyPreview: null,
          hasKey: false,
        });
        return;
      }
      setMe({
        loading: false,
        error: null,
        username: data?.user?.username ?? "",
        role: data?.user?.role ?? "member",
        keyPreview: data?.keyPreview ?? null,
        hasKey: !!data?.hasKey,
      });
    } catch {
      setMe((s) => ({ ...s, loading: false, error: "Can't reach the server right now — try again in a sec." }));
    }
  }, []);

  const loadVersion = useCallback(async () => {
    try {
      const r = await fetch("/api/macro-version", { cache: "no-store" });
      const j = await r.json();
      if (j?.version) setVer({ version: j.version, changelog: j.changelog });
    } catch {}
  }, []);

  useEffect(() => {
    void load();
    void loadVersion();
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("from") === "launcher") setIsFromLauncher(true);
    }
  }, [load, loadVersion]);

  const doDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/macro-download", { cache: "no-store" });
      if (res.status === 401) {
        setGate("login");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        const msg = j?.error ?? `Download didn't work (${res.status})`;
        const hint = j?.hint ? `\n\n${j.hint}` : "";
        setMe((s) => ({ ...s, error: msg + hint }));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      a.download = m?.[1] ?? `mcwv-macros-${me.username || "personal"}.ahk`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      void load();
    } finally {
      setDownloading(false);
    }
  };

  if (gate === "login") {
    return (
      <main className="min-h-screen bg-[var(--background)] pb-16">
        <Navbar />
        <div className="mx-auto mt-24 max-w-lg rounded-2xl border border-[var(--border)] px-6 py-10 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-sm font-semibold text-[var(--foreground)]">You need to sign in first</div>
          <div className="mt-2 text-sm text-[var(--foreground)]/60">Log in with your clan account to get your macros. It only takes a second.</div>
          <a href={isFromLauncher ? "/login?next=/macros?from=launcher" : "/login"} className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-[var(--primary)] px-5 text-sm font-bold text-black">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const isOfficer = me.role === "officer" || me.role === "owner";

  // For members, redirect to launcher — everyone uses launcher now, BUT if from=launcher allow direct download
  if (!me.loading && !isOfficer && !isFromLauncher) {
    return (
      <main className="min-h-screen bg-[var(--background)] pb-16">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 pt-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Your macros</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/60">
            We've moved to the launcher — it's simpler and keeps your file personal to you.
          </p>

          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[13px] font-semibold text-[var(--foreground)]">Use the launcher</div>
                <div className="mt-1 text-xs text-[var(--foreground)]/50">One file, no installer. Log in and hit Launch — that's it.</div>
              </div>
              <Link href="/launcher" className="min-h-12 inline-flex items-center rounded-2xl bg-[var(--primary)] px-6 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,229,162,.25)] transition hover:brightness-110">
                Go to launcher →
              </Link>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <div className="text-xs font-semibold text-[var(--foreground)]/80">How it works</div>
                <div className="mt-2 space-y-2 text-xs leading-5 text-[var(--foreground)]/60">
                  <div className="flex gap-2"><span className="font-bold text-[var(--foreground)]/80">1.</span><span>Download the launcher from /launcher and double-click it.</span></div>
                  <div className="flex gap-2"><span className="font-bold text-[var(--foreground)]/80">2.</span><span>Log in — if you're not whitelisted, contact an officer.</span></div>
                  <div className="flex gap-2"><span className="font-bold text-[var(--foreground)]/80">3.</span><span>Hit Launch Macros. In game, press Ctrl+Alt+M for the panel.</span></div>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <div className="text-xs font-semibold text-[var(--foreground)]/80">Why launcher?</div>
                <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                  It's simpler — no need to install AutoHotkey separately, it handles that. It also keeps your macros up to date automatically and keeps your file tied to your account.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-[11px] text-[var(--foreground)]/30">v{ver?.version ?? "3.5"} • launcher required • works with your clan account</div>
        </div>
      </main>
    );
  }

  // Officer view OR member from launcher — show download
  return (
    <main className="min-h-screen bg-[var(--background)] pb-16">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-8">
        {isFromLauncher && (
          <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
            <div className="text-xs font-bold text-green-300">Launcher detected — direct download enabled</div>
            <div className="mt-1 text-[11px] leading-5 text-green-200/70">You came from MCWV Launcher. Click Download below to get your personal macros with double-hatch + hatch wars 12-step. File saves to Downloads, double-click to run.</div>
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">{isFromLauncher ? "Download your macros" : "Your macros"}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/60">
          {isFromLauncher ? `Hey ${me.username} — personal build for you.` : "Officer view — you can download raw .ahk for testing, but members use launcher."}
          {ver ? <span className="ml-2 inline-flex rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--primary)]">v{ver.version} latest</span> : null}
        </p>

        {me.error && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] leading-5 text-[var(--foreground)]">{me.error}</div>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold text-[var(--foreground)]">{me.loading ? "Loading..." : me.username ? `Hey ${me.username} ${isOfficer ? "(officer)" : ""}` : "Personal build"}</div>
              <div className="mt-1 text-xs text-[var(--foreground)]/50">{me.hasKey && me.keyPreview ? `Key ${me.keyPreview}` : "Personal file — double hatch + hatch wars 12-step"}</div>
            </div>
            <div className="flex gap-2">
              {!isFromLauncher && (
                <Link href="/launcher" className="min-h-12 inline-flex items-center rounded-2xl border border-[var(--border)] bg-[var(--background)] px-5 text-sm font-semibold text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/[0.04]">
                  Launcher →
                </Link>
              )}
              <button
                type="button"
                disabled={downloading || me.loading}
                onClick={() => void doDownload()}
                className="min-h-12 rounded-2xl bg-[var(--primary)] px-6 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,229,162,.25)] transition hover:brightness-110 disabled:opacity-40"
              >
                {downloading ? "Making..." : isFromLauncher ? "⬇ Download Personal Macros" : "⬇ Download .ahk (officer)"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">How to use</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                {isFromLauncher ? "1. Click Download above. 2. File saves to Downloads as mcwv-macros-YOURNAME.ahk. 3. Double-click it. In game: Ctrl+Alt+M panel, Ctrl+Alt+X stop. Includes double hatch + hatch wars pumpkin event." : "Members go to /launcher → Download exe → Login → Launch Macros → Ctrl+Alt+M in game. No direct .ahk download for members — keeps it secure and simple."}
              </div>
            </div>
            {isOfficer && !isFromLauncher && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <div className="text-xs font-semibold text-[var(--foreground)]/80">Officer tools</div>
                <div className="mt-1 text-xs text-[var(--foreground)]/50">You can see keys, health, and shared calibrations.</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href="/macro-health" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-xs font-semibold text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/[0.04]">
                    Macro Health →
                  </a>
                  <a href="/admin" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-xs font-semibold text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/[0.04]">
                    Admin →
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center text-[11px] text-[var(--foreground)]/30">v{ver?.version ?? "3.5"} • {isFromLauncher ? "launcher direct" : "officer"} • works with clan account</div>
      </div>
    </main>
  );
}
