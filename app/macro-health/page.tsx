"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type EventRow = {
  event: string;
  runs: number;
  ok: number;
  failed: number;
  members: number;
  avg_s: string | number | null;
  last_run: string | null;
  failing_members: string[] | null;
};
type FailRow = { event: string; result: string; member: string; version: string; at: string };
type KeyRow = {
  id: number;
  key: string;
  member_name: string;
  member_id: number | null;
  member_username: string | null;
  issued_at: string;
  last_seen: string | null;
  last_ip: string | null;
  last_pc: string | null;
  runs: number;
  revoked_at: string | null;
  revoked_reason: string | null;
  seen_ips: string[] | null;
  seen_pcs: string[] | null;
  issued_by_name: string | null;
  ips_24h: number;
  activations_7d: number;
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "just now";
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function MacroHealthPage() {
  const [tab, setTab] = useState<"health" | "keys">("health");
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [fails, setFails] = useState<FailRow[]>([]);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<"none" | "login" | "officer">("none");
  const [issueName, setIssueName] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);

  const loadHealth = useCallback(async (h: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/macro-report?hours=${h}`, { cache: "no-store" });
      if (res.status === 401) { setGate("login"); return; }
      if (res.status === 403) { setGate("officer"); return; }
      if (res.status === 503) { setErr("telemetry disabled — run the migration and set MACRO_REPORT_KEY"); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setErr(data?.error ?? "Couldn't reach the hub — try again."); return; }
      setEvents(data.events ?? []);
      setFails(data.recent_failures ?? []);
      setErr(null);
      setGate("none");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/macro-keys", { cache: "no-store" });
      if (res.status === 401) { setGate("login"); return; }
      if (res.status === 403) { setGate("officer"); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setErr(data?.error ?? "Couldn't load keys"); return; }
      setKeys(data.keys ?? []);
      setErr(null);
      setGate("none");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "health") void loadHealth(hours);
    else void loadKeys();
  }, [tab, hours, loadHealth, loadKeys]);

  const act = async (action: "revoke" | "restore", id: number, reason?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/macro-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, reason }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) setErr(j?.error ?? `${action} failed`);
      else await loadKeys();
    } finally {
      setBusy(false);
    }
  };

  const issue = async () => {
    if (!issueName.trim()) return;
    setIssueBusy(true);
    try {
      const res = await fetch("/api/macro-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue", memberName: issueName.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) setErr(j?.error ?? "issue failed");
      else {
        setIssueName("");
        await loadKeys();
      }
    } finally {
      setIssueBusy(false);
    }
  };

  if (gate !== "none") {
    return (
      <main className="min-h-screen bg-[var(--background)] pb-16">
        <Navbar />
        <div className="mx-auto mt-24 max-w-lg rounded-2xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--foreground)]/70">
          {gate === "login" ? "Sign in to see fleet health." : "Macro Health is an officers-only view."}
        </div>
      </main>
    );
  }

  const totalRuns = (events ?? []).reduce((a, e) => a + (e.runs ?? 0), 0);
  const totalFail = (events ?? []).reduce((a, e) => a + (e.failed ?? 0), 0);
  const health = totalRuns > 0 ? Math.round((1 - totalFail / totalRuns) * 100) : null;

  return (
    <main className="min-h-screen bg-[var(--background)] pb-16">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">🤖 Macro Health</h1>
          <div className="flex overflow-hidden rounded-2xl border border-[var(--border)] text-sm">
            <button type="button" onClick={() => setTab("health")} className={`min-h-11 px-4 transition ${tab === "health" ? "bg-[var(--primary)] font-bold text-black" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/[0.05]"}`}>Fleet</button>
            <button type="button" onClick={() => setTab("keys")} className={`min-h-11 px-4 transition ${tab === "keys" ? "bg-[var(--primary)] font-bold text-black" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/[0.05]"}`}>Keys</button>
          </div>
          {tab === "health" && (
            <>
              <div className="flex overflow-hidden rounded-2xl border border-[var(--border)] text-sm">
                {[24, 168].map((h) => (
                  <button key={h} type="button" disabled={busy} onClick={() => setHours(h)}
                    className={`min-h-11 px-4 transition ${hours === h ? "bg-[var(--primary)] font-bold text-black" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/[0.05]"}`}>
                    {h === 24 ? "24h" : "7d"}
                  </button>
                ))}
              </div>
              <button type="button" disabled={busy} onClick={() => void loadHealth(hours)}
                className="min-h-11 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.05] px-4 text-sm text-[var(--foreground)]/85 transition hover:bg-[var(--foreground)]/[0.07] disabled:opacity-40">
                {busy ? "refreshing…" : "refresh"}
              </button>
              {health !== null && (
                <span className={`min-h-11 inline-flex items-center rounded-2xl px-4 text-sm font-bold ${health >= 98 ? "bg-[var(--primary)]/15 text-[var(--primary)]" : health >= 90 ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-red-500/15 text-red-400"}`}>
                  {health}% clean
                </span>
              )}
            </>
          )}
          {tab === "keys" && (
            <button type="button" disabled={busy} onClick={() => void loadKeys()}
              className="min-h-11 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.05] px-4 text-sm text-[var(--foreground)]/85 transition hover:bg-[var(--foreground)]/[0.07] disabled:opacity-40">
              {busy ? "refreshing…" : "refresh"}
            </button>
          )}
        </div>

        <p className="mt-2 text-sm text-[var(--foreground)]/50">
          {tab === "health" ? "One line per macro run per member · manual stops don't count · dry-runs tagged." : "Per-member keys · same key on 3+ IPs in 24h = sharing flag · revoked keys block macros immediately (3-day offline grace)."}
        </p>

        {err && <div className="mt-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.07] px-4 py-2.5 text-[13px] text-[var(--foreground)]">{err}</div>}

        {tab === "health" ? (
          events === null && !err ? (
            <div className="mt-10 text-center text-sm text-[var(--foreground)]/50">loading fleet…</div>
          ) : events?.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--foreground)]/60">
              No runs in this window yet. Telemetry is dark until personalized builds from <a href="/macros" className="underline decoration-[var(--primary)]/40 underline-offset-4">/macros</a> are in use — then every run appears within seconds.
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--foreground)]/[0.03] text-xs uppercase tracking-wide text-[var(--foreground)]/50">
                    <tr>
                      <th className="px-4 py-3">event</th>
                      <th className="px-4 py-3 text-right">runs</th>
                      <th className="px-4 py-3 text-right">ok</th>
                      <th className="px-4 py-3 text-right">failed</th>
                      <th className="px-4 py-3 text-right">members</th>
                      <th className="px-4 py-3 text-right">avg s</th>
                      <th className="px-4 py-3">last run</th>
                      <th className="px-4 py-3">who&apos;s failing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events!.map((e) => (
                      <tr key={e.event} className="border-t border-[var(--border)]/60">
                        <td className="px-4 py-3 font-medium text-[var(--foreground)]">{e.event}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.runs}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--primary)]">{e.ok}</td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${e.failed > 0 ? "text-red-400" : "text-[var(--foreground)]/30"}`}>{e.failed}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.members}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.avg_s === null ? "—" : Number(e.avg_s).toFixed(1)}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]/60">{ago(e.last_run)}</td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1">
                            {(e.failing_members ?? []).slice(0, 6).map((m) => (
                              <span key={m} className="rounded-lg bg-red-500/10 px-2 py-0.5 text-xs text-red-300">{m}</span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 className="mt-10 text-lg font-bold text-[var(--foreground)]">Recent failures</h2>
              {fails.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--foreground)]/50">nothing red — the clan&apos;s screens are fine.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {fails.map((f, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[var(--border)] px-4 py-2.5 text-sm">
                      <span className="text-[var(--foreground)]/45">{f.at}</span>
                      <span className="font-medium text-[var(--foreground)]">{f.event}</span>
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${f.result === "panic" ? "bg-red-500/15 text-red-300" : f.result === "timeout" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--foreground)]/10 text-[var(--foreground)]/70"}`}>{f.result}</span>
                      <span className="text-[var(--foreground)]/70">{f.member}</span>
                      <span className="ml-auto text-xs text-[var(--foreground)]/40">v{f.version}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              <input value={issueName} onChange={(e) => setIssueName(e.target.value)} placeholder="member name (for manual issue)"
                className="min-h-11 w-64 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]/50" />
              <button disabled={issueBusy || !issueName.trim()} onClick={() => void issue()}
                className="min-h-11 rounded-2xl bg-[var(--primary)] px-4 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-40">
                {issueBusy ? "issuing…" : "Issue key"}
              </button>
              <span className="self-center text-xs text-[var(--foreground)]/40">Members auto-get a key on first download at /macros — this is for pre-creating or for alt names.</span>
            </div>

            {keys === null ? (
              <div className="mt-10 text-center text-sm text-[var(--foreground)]/50">loading keys…</div>
            ) : keys.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--foreground)]/60">
                No keys yet. Members get one automatically when they hit <code className="text-[var(--primary)]">/macros</code> → Download.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--foreground)]/[0.03] text-xs uppercase tracking-wide text-[var(--foreground)]/50">
                    <tr>
                      <th className="px-3 py-3">member</th>
                      <th className="px-3 py-3">key</th>
                      <th className="px-3 py-3">last seen</th>
                      <th className="px-3 py-3">IPs 24h</th>
                      <th className="px-3 py-3">runs</th>
                      <th className="px-3 py-3">last IP / PC</th>
                      <th className="px-3 py-3">status</th>
                      <th className="px-3 py-3">actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => {
                      const sharing = k.ips_24h > 2;
                      const revoked = !!k.revoked_at;
                      return (
                        <tr key={k.id} className={`border-t border-[var(--border)]/60 ${revoked ? "opacity-50" : ""} ${sharing && !revoked ? "bg-red-500/[0.06]" : ""}`}>
                          <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">
                            {k.member_username ?? k.member_name}
                            <span className="ml-2 text-xs text-[var(--foreground)]/40">{k.issued_by_name ? `by ${k.issued_by_name}` : ""}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-[var(--foreground)]/70">{k.key.slice(0, 8)}…{k.key.slice(-4)}</td>
                          <td className="px-3 py-2.5 text-xs text-[var(--foreground)]/60">{ago(k.last_seen)}</td>
                          <td className={`px-3 py-2.5 text-center tabular-nums ${sharing ? "font-bold text-red-300" : "text-[var(--foreground)]/60"}`}>{k.ips_24h}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-[var(--foreground)]/60">{k.runs}</td>
                          <td className="px-3 py-2.5 text-xs text-[var(--foreground)]/50 max-w-[160px] truncate">{k.last_ip ?? "—"} {k.last_pc ? `· ${k.last_pc}` : ""}</td>
                          <td className="px-3 py-2.5">
                            {revoked ? <span className="rounded-lg bg-[var(--foreground)]/10 px-2 py-0.5 text-xs text-[var(--foreground)]/50">revoked</span> : sharing ? <span className="rounded-lg bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300">sharing?</span> : <span className="rounded-lg bg-[var(--primary)]/15 px-2 py-0.5 text-xs text-[var(--primary)]">active</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {revoked ? (
                              <button disabled={busy} onClick={() => void act("restore", k.id)} className="rounded-xl border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/[0.05]">restore</button>
                            ) : (
                              <button disabled={busy} onClick={() => { const r = prompt(`Revoke ${k.member_name}? reason:`); if (r !== null) void act("revoke", k.id, r || "revoked"); }} className="rounded-xl border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/15">revoke</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.02] p-4 text-xs leading-5 text-[var(--foreground)]/50">
              <div className="font-semibold text-[var(--foreground)]/70">How this stops sharing</div>
              <ul className="mt-1 list-disc pl-5">
                <li>Every personalized file carries <code className="text-[var(--primary)]">MEMBER_KEY</code> + <code className="text-[var(--primary)]">MEMBER</code> in its header — visible watermark.</li>
                <li>On start + every 30 min it POSTs to <code>/api/macro-activate</code>. Officer sees last IP/PC and distinct IP count.</li>
                <li>3+ IPs in 24h = red flag. One click revoke — the next heartbeat blocks that copy with &quot;key revoked&quot;.</li>
                <li>Offline grace 72h so a Vercel hiccup or member&apos;s bad WiFi never locks the clan out mid-war.</li>
                <li>Tell members: don&apos;t forward the file, send them to <code>/macros</code>. Forwarded copies still phone home with the original key.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
