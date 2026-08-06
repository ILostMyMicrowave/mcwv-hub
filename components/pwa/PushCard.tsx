"use client";

import { useCallback, useEffect, useState } from "react";

// Mirrored server-side as WEB_PUSH_VAPID_PUBLIC_KEY. Public by design —
// VAPID public keys are meant to ship to clients.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

type IosNavigator = Navigator & { standalone?: boolean };

export default function PushCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  // Officer-only: clan-wide "Discord broadcasts → app alerts" kill-switch.
  const [bcPref, setBcPref] = useState<{ officer: boolean; enabled: boolean } | null>(null);
  const [bcBusy, setBcBusy] = useState(false);
  // Diagnostics: which worker is ACTUALLY alive on this device + device count.
  const [diag, setDiag] = useState<{ version: string | null; devices: number | null } | null>(null);

  // Ask the living worker for its version (push-sw.js ≥v5 answers; zombie
  // workers from before never reply → we warn instead).
  async function queryWorkerVersion(): Promise<string | null> {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
      if (!worker) return null;
      const channel = new MessageChannel();
      const reply = new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          const data = event.data as { type?: string; version?: string } | null;
          resolve(data?.type === "mcwv-version" ? (data.version ?? null) : null);
        };
      });
      worker.postMessage("mcwv-version?", [channel.port2]);
      return await reply;
    } catch {
      return null;
    }
  }

  async function refreshDiag() {
    if (!supported || typeof Notification === "undefined") return;
    const version = await queryWorkerVersion();
    let devices: number | null = null;
    try {
      const res = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { devices?: number };
        devices = typeof data.devices === "number" ? data.devices : null;
      }
    } catch {
      devices = null;
    }
    setDiag({ version, devices });
  }

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";

  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    const nav = navigator as IosNavigator;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      nav.standalone === true;
    setIosNeedsInstall(
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone
    );
    if (!VAPID_PUBLIC) {
      setStatus("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const res = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (res.status === 401) {
        setStatus("off");
        return;
      }
      const data = (await res.json()) as { subscribed?: boolean };
      setStatus(data.subscribed ? "on" : "off");
    } catch {
      setStatus("off");
    }
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status === "on") void refreshDiag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    fetch("/api/push/broadcast-pref", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          const pref = data as { officer?: boolean; enabled?: boolean };
          setBcPref({ officer: Boolean(pref.officer), enabled: pref.enabled !== false });
        }
      })
      .catch(() => null);
  }, []);

  async function toggleBroadcastAlerts() {
    if (!bcPref) return;
    setBcBusy(true);
    try {
      const res = await fetch("/api/push/broadcast-pref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !bcPref.enabled }),
      });
      if (res.ok) {
        setBcPref({ ...bcPref, enabled: !bcPref.enabled });
      }
    } finally {
      setBcBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        setNote("Notification permission wasn't granted.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("save-failed");
      setStatus("on");
      setNote("Alerts on ✅ You'll get a ping the moment war is declared.");
    } catch {
      setNote("Couldn't enable alerts — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      await subscription?.unsubscribe().catch(() => undefined);
      if (endpoint) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined);
      }
      setStatus("off");
      setNote("Alerts off.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        notifId?: number | null;
        inboxLogged?: boolean;
      };
      setNote(
        res.ok
          ? data.inboxLogged === false
            ? `Push sent ✅ but ⚠️ the inbox copy failed to save — inbox would look EMPTY. Owner: check Vercel logs for "inbox log failed".`
            : `Test sent ✅ (${data.sent ?? 0} device${
                (data.sent ?? 0) === 1 ? "" : "s"
              }) — inbox copy${
                data.notifId ? ` #${data.notifId}` : ""
              } saved ✓ Tap the notification to open it!`
          : data.error ?? "Test failed."
      );
    } catch {
      setNote("Test failed.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <p className="text-sm font-bold text-white">🔔 War alerts</p>
        <p className="mt-1 text-sm text-zinc-400">
          Push alerts aren&apos;t supported in this browser. On iPhone,
          install the app first — iOS delivers web push only to
          home-screen apps.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">🔔 War alerts</p>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Get an instant ping when a clan battle goes live — even when the
            app&apos;s closed. Opt-in, and yours alone.
          </p>
        </div>

        {status === "on" ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void test()}
              disabled={busy}
              className="rounded-2xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-400/15 disabled:opacity-60"
            >
              🔔 Test
            </button>
            <button
              type="button"
              onClick={() => void disable()}
              disabled={busy}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:-translate-y-0.5 hover:bg-white/10 disabled:opacity-60"
            >
              Turn off
            </button>
          </div>
        ) : status === "denied" || status === "unconfigured" ? null : (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy || status === "loading"}
            className="shrink-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Working…" : "🔔 Enable alerts"}
          </button>
        )}
      </div>

      {status === "denied" ? (
        <p className="mt-3 text-sm text-amber-300/90">
          Notifications are blocked for this site — allow them in your
          browser&apos;s site settings, then come back here.
        </p>
      ) : null}
      {status === "unconfigured" ? (
        <p className="mt-3 text-sm text-amber-300/90">
          Push isn&apos;t wired up on the server yet — an owner needs to add
          the VAPID keys on Vercel.
        </p>
      ) : null}
      {iosNeedsInstall && status !== "on" ? (
        <p className="mt-3 text-sm text-zinc-500">
          📱 On iPhone: install the app first (card above) — Apple only
          delivers web push to home-screen apps.
        </p>
      ) : null}
      {note ? (
        <p className="mt-3 text-sm text-zinc-300">{note}</p>
      ) : null}

      {status === "on" && diag ? (
        diag.version ? (
          <p className="mt-3 text-xs text-zinc-500">
            ⚙️ Worker v{diag.version} ✓
            {diag.devices !== null
              ? ` · ${diag.devices} device${diag.devices === 1 ? "" : "s"} subscribed`
              : ""}{" "}
            ·{" "}
            <a
              href="/notifications"
              className="font-semibold text-violet-300 underline decoration-violet-400/40 underline-offset-2 transition hover:text-violet-200"
            >
              📬 Open inbox
            </a>
          </p>
        ) : (
          <p className="mt-3 text-xs text-amber-300/90">
            ⚠️ Alerts work, but your phone runs an old worker (no version
            reply). Toggle alerts off/on once to refresh it.
          </p>
        )
      ) : null}

      {bcPref?.officer ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">📢 Broadcasts → app alerts</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Officer setting — Discord broadcasts also ping every subscribed
              app. Clan-wide.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleBroadcastAlerts()}
            disabled={bcBusy}
            className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:opacity-60 ${
              bcPref.enabled
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-black"
                : "border border-white/10 bg-white/5 text-zinc-300"
            }`}
          >
            {bcPref.enabled ? "On ✓" : "Off"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
