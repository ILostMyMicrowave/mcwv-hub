"use client";

import { useEffect, useState } from "react";

// "Connect BIG Games" panel shown on a member's own profile. Lets them
// authorize the MCWV developer app so the hub can read their full PS99 account
// data (profile/inventory/extendedProfile) even when publicViews are off.

export default function BigGamesConnect({ isMe }: { isMe: boolean }) {
  const [status, setStatus] = useState<{
    connected: boolean;
    configured: boolean;
    robloxId?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!isMe) return;
    let alive = true;
    fetch("/api/biggames/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setStatus(j))
      .catch(() => alive && setStatus({ connected: false, configured: false }));
    return () => {
      alive = false;
    };
  }, [isMe]);

  // Surface success/error from the OAuth callback redirect (?bg_success=...).
  useEffect(() => {
    if (!isMe) return;
    const sp = new URLSearchParams(window.location.search);
    const err = sp.get("bg_error");
    const ok = sp.get("bg_success");
    if (err) setMessage({ text: err, error: true });
    else if (ok) setMessage({ text: ok, error: false });
    if (err || ok) {
      // Clean the query string so a refresh doesn't re-show the toast.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [isMe]);

  if (!isMe) return null;

  function connect() {
    setBusy(true);
    window.location.href = "/api/biggames/authorize";
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/biggames/disconnect", { method: "POST" });
      setStatus({ connected: false, configured: status?.configured ?? false });
      setMessage({ text: "Disconnected from BIG Games.", error: false });
    } catch {
      setMessage({ text: "Failed to disconnect.", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  if (!status.configured) return null; // server not configured — hide silently

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        status.connected
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
          : "border-violet-400/25 bg-violet-400/10 text-violet-100"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-base">
            {status.connected ? "✅" : "🔒"}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">
              {status.connected ? "Connected to BIG Games" : "Unlock full PS99 data"}
            </p>
            <p className="text-xs opacity-80">
              {status.connected
                ? "Your profile now shows private account data (inventory, extended profile)."
                : "Authorize the MCWV app to read your full profile, inventory and extended data — even if your public views are off."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={status.connected ? disconnect : connect}
          disabled={busy}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
            status.connected
              ? "border border-white/10 bg-white/10 text-white hover:bg-white/15"
              : "bg-gradient-to-r from-violet-500 to-fuchsia-400 text-white hover:opacity-90"
          }`}
        >
          {busy ? "Working…" : status.connected ? "Disconnect" : "Connect BIG Games"}
        </button>
      </div>

      {message && (
        <p className={`mt-2 text-xs ${message.error ? "text-rose-300" : "text-emerald-200"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
