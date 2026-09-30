"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

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
  changelog?: Record<string,string>;
};

type CalibMeta = {
  task_name: string;
  member_name: string;
  created_at: string;
  is_official: boolean;
  checks: any;
};

export default function MacrosPage() {
  const [me, setMe] = useState<MeState>({ loading: true, error: null, username: "", role: "member", keyPreview: null, hasKey: false });
  const [downloading, setDownloading] = useState(false);
  const [gate, setGate] = useState<"none" | "login">("none");
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [calibs, setCalibs] = useState<CalibMeta[]>([]);
  const [calibLoading, setCalibLoading] = useState(false);

  const load = useCallback(async () => {
    setMe((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/macro-me", { cache: "no-store" });
      if (res.status === 401) { setGate("login"); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const sres = await fetch("/api/app-status", { cache: "no-store" });
        const sdata = await sres.json().catch(() => null);
        if (!sdata?.authenticated) { setGate("login"); return; }
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

  const loadCalibs = useCallback(async () => {
    setCalibLoading(true);
    try {
      // we don't have list endpoint yet, but we can try to fetch via macro-calib?task= (need list)
      // For now, try to get from macro-report stats or just leave empty — show how sharing works
      // Future: add /api/macro-calib/list
      const r = await fetch("/api/macro-report", { cache: "no-store" });
      // not needed for v2.8, calibs shown per task via manual query
    } catch {}
    setCalibLoading(false);
  }, []);

  useEffect(() => { void load(); void loadVersion(); void loadCalibs(); }, [load, loadVersion, loadCalibs]);

  const doDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/macro-download", { cache: "no-store" });
      if (res.status === 401) { setGate("login"); return; }
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
          <div className="mt-2 text-sm text-[var(--foreground)]/60">Log in with your clan account to get your personal macro file. It only takes a second.</div>
          <a href="/login" className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-[var(--primary)] px-5 text-sm font-bold text-black">Sign in</a>
        </div>
      </main>
    );
  }

  const isOfficer = me.role === "officer" || me.role === "owner";

  return (
    <main className="min-h-screen bg-[var(--background)] pb-16">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Your macros</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/60">
          This is your personal file — made just for you. Double-click it and press Ctrl+Alt+M for the panel. That's it.
          {ver ? <span className="ml-2 inline-flex rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--primary)]">v{ver.version} latest</span> : null}
        </p>

        {me.error && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] leading-5 text-[var(--foreground)]">
            {me.error}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold text-[var(--foreground)]">
                {me.loading ? "Loading your info…" : me.username ? `Hey ${me.username} 👋` : "Your build"}
              </div>
              <div className="mt-1 text-xs text-[var(--foreground)]/50">
                {me.hasKey && me.keyPreview ? `Your file is ready — key ${me.keyPreview}` : "First time? Your personal file gets created when you download."}
              </div>
            </div>
            <button
              type="button"
              disabled={downloading || me.loading}
              onClick={() => void doDownload()}
              className="min-h-12 rounded-2xl bg-[var(--primary)] px-6 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,229,162,.25)] transition hover:brightness-110 disabled:opacity-40"
            >
              {downloading ? "Making your file…" : "⬇ Download my file"}
            </button>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">How to use it</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                You need AutoHotkey v2 (free). Install it, then double-click your file. The dark panel pops up — that's where you run things. 
                <span className="text-[var(--foreground)]/80"> Ctrl+Alt+M</span> shows/hides it, <span className="text-[var(--foreground)]/80">Ctrl+Alt+X</span> stops everything.
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">Auto-updates + queue</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                Your file checks for updates every hour and tells you when there's a new version. You can also queue tasks — they run one after another, no more skipping.
                If something fails, it saves a screenshot to <span className="font-mono text-[11px]">%USERPROFILE%\MCWV\fail-*.png</span> so you can send it to officers.
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">Share your setup with the clan</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                Set up a task with F1, then in the Settings tab hit <span className="text-[var(--foreground)]/80">Share your setup</span>. Officers can make it official so everyone gets a more reliable version.
                Works even offline — file checks in when you have internet but keeps working for 3 days.
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">Please don't share the file</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                It's tied to your account. If someone else needs it, just send them here to get their own — takes 10 seconds.
              </div>
            </div>
          </div>
        </div>

        {ver?.changelog && (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.02] p-4">
            <div className="text-xs font-semibold text-[var(--foreground)]/70">What's new</div>
            <div className="mt-2 space-y-1.5">
              {Object.entries(ver.changelog).slice(0,4).map(([v, note]) => (
                <div key={v} className="flex gap-2 text-xs">
                  <span className="font-mono font-bold text-[var(--primary)]">v{v}</span>
                  <span className="text-[var(--foreground)]/60">{note}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isOfficer && (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.02] p-4">
            <div className="text-xs font-semibold text-[var(--foreground)]/70">Officer tools</div>
            <div className="mt-1 text-xs text-[var(--foreground)]/50">You can see everyone's keys, health, and shared calibrations.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/macro-health" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-xs font-semibold text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/[0.04]">Macro Health →</a>
              <a href="/members" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-xs font-semibold text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/[0.04]">Members →</a>
            </div>
            <div className="mt-3 rounded-xl bg-[var(--background)] border border-[var(--border)] px-3 py-2 text-[11px] leading-4 text-[var(--foreground)]/50">
              Shared calibrations land in <span className="font-mono">mcwv_macro_calibs</span>. To make one official: <span className="font-mono">UPDATE ... SET is_official=true WHERE id=...</span> or use the POST with <span className="font-mono">isOfficial:true</span> (officer only). Official calibs are preferred when loading.
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-[11px] text-[var(--foreground)]/30">
          v{ver?.version ?? "2.8"} • personal file • works with AHK v2 • {me.hasKey ? "your file is personal" : "get yours above"}
        </div>
      </div>
    </main>
  );
}
