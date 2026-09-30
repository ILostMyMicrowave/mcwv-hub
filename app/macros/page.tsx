"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type MeState = {
  loading: boolean;
  error: string | null;
  username: string;
  keyPreview: string | null;
  hasKey: boolean;
};

export default function MacrosPage() {
  const [me, setMe] = useState<MeState>({ loading: true, error: null, username: "", keyPreview: null, hasKey: false });
  const [downloading, setDownloading] = useState(false);
  const [gate, setGate] = useState<"none" | "login">("none");

  const load = useCallback(async () => {
    setMe((s) => ({ ...s, loading: true, error: null }));
    try {
      // Reuse /api/auth/me or /api/macro-keys? Let's hit /api/macro-keys for member — it 403s for members, so we need a lightweight me endpoint.
      // Use /api/auth/user or /api/app-status which returns auth state.
      const res = await fetch("/api/app-status", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!data?.authenticated) {
        setGate("login");
        return;
      }
      // Try to get existing key via a dedicated lightweight endpoint: we can hit /api/macro-download HEAD? Simpler: call download with ?check=1 (we'll handle as dry check)
      // For now, just show username from app-status and assume key will be auto-issued on download.
      // If user is officer, we can also fetch keys list to show preview.
      let keyPreview: string | null = null;
      let hasKey = false;
      try {
        const kr = await fetch("/api/macro-keys", { cache: "no-store" });
        if (kr.ok) {
          const kd = await kr.json();
          const my = (kd.keys ?? []).find((k: any) => k.member_id && data?.user?.id && k.member_id === data.user.id && !k.revoked_at);
          if (my) {
            hasKey = true;
            keyPreview = String(my.key).slice(0, 8) + "…" + String(my.key).slice(-4);
          }
        } else if (kr.status === 403) {
          // member — no keys endpoint, but we can still indicate that download will auto-issue
          hasKey = false;
        }
      } catch {}
      setMe({
        loading: false,
        error: null,
        username: data?.user?.username ?? data?.username ?? "",
        keyPreview,
        hasKey,
      });
    } catch (e) {
      setMe((s) => ({ ...s, loading: false, error: "Couldn't reach hub — try again." }));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/macro-download", { cache: "no-store" });
      if (res.status === 401) { setGate("login"); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setMe((s) => ({ ...s, error: j?.error ?? `Download failed (${res.status})` }));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // filename from Content-Disposition if present
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
        <div className="mx-auto mt-24 max-w-lg rounded-2xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--foreground)]/70">
          Sign in to get your personal macro file. Your hub account = your macro key.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] pb-16">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">📦 Your Macros</h1>
        <p className="mt-2 text-sm text-[var(--foreground)]/60">
          One personal file. Double-click, Ctrl+Alt+M for the panel. Your key is baked in — if this file leaks, we know whose.
        </p>

        {me.error && (
          <div className="mt-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.07] px-4 py-2.5 text-[13px] text-[var(--foreground)]">
            {me.error}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">
                {me.loading ? "loading…" : me.username ? `Hi, ${me.username}` : "Your build"}
              </div>
              <div className="mt-1 text-xs text-[var(--foreground)]/50">
                {me.hasKey && me.keyPreview ? `Active key: ${me.keyPreview} · auto-renews on download` : "First download auto-creates your key (officer can revoke anytime)."}
              </div>
            </div>
            <button
              type="button"
              disabled={downloading || me.loading}
              onClick={() => void doDownload()}
              className="min-h-11 rounded-2xl bg-[var(--primary)] px-5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {downloading ? "building…" : "⬇ Download my .ahk"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 text-xs leading-5 text-[var(--foreground)]/60">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
              <span className="font-semibold text-[var(--foreground)]/80">How it stays clan-only:</span> your file pings <code className="text-[var(--primary)]">/api/macro-activate</code> on start and every 30 min. No internet for 3 days? Still works — it uses the last good check. Revoked or copied to 3+ IPs in 24h? Officers see it on <a href="/macro-health" className="underline decoration-[var(--primary)]/40 underline-offset-4">Macro Health</a>.
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
              <span className="font-semibold text-[var(--foreground)]/80">Install:</span> need AutoHotkey v2 (free). Double-click the downloaded file. Ctrl+Alt+M toggles the dark panel, Ctrl+Alt+X stops everything, F12 pauses. Calibrate with Ctrl+Alt+C once per PC — crops land in %USERPROFILE%\MCWV.
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
              <span className="font-semibold text-[var(--foreground)]/80">Sharing:</span> don&apos;t forward the file — send them here. A forwarded copy carries your name in its header and still phones home with your key. Leak = revoked + named.
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-[var(--foreground)]/40">
          Officers: manage all keys, sharing flags, and fleet health on <a href="/macro-health" className="underline">/macro-health</a>. Members only see this page.
        </div>
      </div>
    </main>
  );
}
