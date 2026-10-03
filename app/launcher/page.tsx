"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

type LauncherVersion = {
  version: string;
  size: string;
  downloadUrl: string;
  changelog?: string[];
};

export default function LauncherPage() {
  const [ver, setVer] = useState<LauncherVersion | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch("/api/launcher/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.version) setVer({ version: j.version, size: j.size || "396KB", downloadUrl: j.downloadUrl || "/launcher/MCWV-Launcher.exe", changelog: j.changelog });
      })
      .catch(() => {});
  }, []);

  const doDownload = async () => {
    setDownloading(true);
    try {
      // Direct download from public folder
      const a = document.createElement("a");
      a.href = ver?.downloadUrl || "/launcher/MCWV-Launcher.exe";
      a.download = "MCWV-Launcher.exe";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] pb-16">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Launcher</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/60">
          One file to get your macros. Download it, log in, and hit Launch. That's it.
          {ver ? <span className="ml-2 inline-flex rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--primary)]">v{ver.version} • {ver.size}</span> : null}
        </p>

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold text-[var(--foreground)]">MCWV Launcher</div>
              <div className="mt-1 text-xs text-[var(--foreground)]/50">Single file, no installer. Works on Windows 10/11.</div>
            </div>
            <button
              type="button"
              disabled={downloading}
              onClick={() => void doDownload()}
              className="min-h-12 rounded-2xl bg-[var(--primary)] px-6 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,229,162,.25)] transition hover:brightness-110 disabled:opacity-40"
            >
              {downloading ? "Downloading…" : "⬇ Download Launcher"}
            </button>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">How to use it</div>
              <div className="mt-2 space-y-2 text-xs leading-5 text-[var(--foreground)]/60">
                <div className="flex gap-2"><span className="font-bold text-[var(--foreground)]/80">1.</span><span>Download the exe above (396KB) and double-click it. If Windows shows SmartScreen, click More info → Run anyway.</span></div>
                <div className="flex gap-2"><span className="font-bold text-[var(--foreground)]/80">2.</span><span>Click Login with Discord and log in to your clan account. If you're not whitelisted yet, it'll tell you — just contact an officer.</span></div>
                <div className="flex gap-2"><span className="font-bold text-[var(--foreground)]/80">3.</span><span>Hit Launch Macros. It gets your personal file and runs it. In game, press Ctrl+Alt+M for the panel.</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">Why use the launcher?</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                It's the easiest way. No need to install AutoHotkey separately — it handles that for you. It also keeps your macros up to date automatically and keeps your file personal to you.
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="text-xs font-semibold text-[var(--foreground)]/80">Prefer the single file?</div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground)]/60">
                You can still get your .ahk file directly from <Link href="/macros" className="text-[var(--foreground)]/80 underline">/macros</Link> and double-click it. The launcher is just a simpler wrapper — both work the same in game.
              </div>
            </div>
          </div>
        </div>

        {ver?.changelog && ver.changelog.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.02] p-4">
            <div className="text-xs font-semibold text-[var(--foreground)]/70">What's new in v{ver.version}</div>
            <div className="mt-2 space-y-1.5">
              {ver.changelog.slice(0, 4).map((note, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-[var(--foreground)]/40">•</span>
                  <span className="text-[var(--foreground)]/60">{note}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-[11px] text-[var(--foreground)]/30">
          v{ver?.version ?? "1.0.0"} • single exe • no installer • works with your clan account
        </div>
      </div>
    </main>
  );
}
