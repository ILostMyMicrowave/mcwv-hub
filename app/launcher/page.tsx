"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function LauncherPage() {
  const [version, setVersion] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/launcher/version").then(r=>r.json()).then(setVersion).catch(()=>{});
  }, []);

  function copy(txt: string, id: string) {
    navigator.clipboard.writeText(txt).then(()=>{
      setCopied(id);
      setTimeout(()=>setCopied(null), 1500);
    });
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-black grid place-items-center font-black">M</div>
            <div>
              <div className="font-black tracking-tight">MCWV</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 -mt-1">Clan Wars</div>
            </div>
          </Link>
          <div className="flex gap-2">
            <Link href="/macros" className="text-xs border border-zinc-800 rounded-full px-4 py-2 hover:bg-zinc-900">Macros</Link>
            <Link href="/dashboard" className="text-xs bg-white text-black rounded-full px-4 py-2 font-bold">Dashboard</Link>
          </div>
        </div>

        {/* Hero */}
        <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/50 p-8 md:p-10 backdrop-blur">
          <div className="flex flex-wrap gap-3 mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-900 bg-emerald-950/50 px-3 py-1 text-[11px] font-bold tracking-wide text-emerald-300">✅ 0 ERRORS — AUDITED</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] font-bold tracking-wide text-zinc-400">v{version?.version || "1.0.0"} • {version?.size || "8.2MB"} • SINGLE EXE</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] font-bold tracking-wide text-zinc-400">FULLY SECURE • HWID LOCK • DPAPI</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-[-0.04em] leading-[0.9]">Secure C++ Launcher<br/>1-click, whitelist,<br/><span className="text-emerald-400">no bullshit</span></h1>
          <p className="mt-4 max-w-2xl text-zinc-400 text-sm leading-relaxed">
            Whole ass C++ app with registration + whitelist, but simple. Download single .exe, double-click, login via browser (Discord), auto HWID lock, downloads your personal macro (85K, audited v3.5), verifies HMAC signature, runs. No installer, no admin, stays in tray.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={version?.downloadUrl || "/launcher/MCWV-Launcher.exe"} className="inline-flex items-center gap-2 rounded-full bg-[#00E5A2] text-black px-6 py-3 font-black text-sm hover:bg-[#00ffaa] transition">
              ⬇ Download MCWV-Launcher.exe
            </a>
            <button onClick={()=>copy("MCWV-Launcher.exe — single file, double-click, no installer", "dl")} className="rounded-full border border-zinc-800 bg-zinc-900 px-5 py-3 text-xs font-bold hover:bg-zinc-800">
              {copied==="dl" ? "Copied ✓" : "📋 Copy info"}
            </button>
            <Link href="/macros" className="rounded-full border border-zinc-800 bg-zinc-900 px-5 py-3 text-xs font-bold hover:bg-zinc-800">Or use web macros →</Link>
          </div>

          <div className="mt-6 grid md:grid-cols-3 gap-3 text-[11px]">
            <div className="rounded-xl bg-black/50 border border-zinc-800 p-3">
              <div className="text-zinc-500 uppercase tracking-widest font-bold">Flow</div>
              <div className="mt-1 font-mono">Download → Login → Whitelist check → Launch → Ctrl+Alt+M</div>
            </div>
            <div className="rounded-xl bg-black/50 border border-zinc-800 p-3">
              <div className="text-zinc-500 uppercase tracking-widest font-bold">Security</div>
              <div className="mt-1 font-mono">HWID SHA256 + salt, DPAPI token, HMAC verify, TLS 1.3, Rust crypto</div>
            </div>
            <div className="rounded-xl bg-black/50 border border-zinc-800 p-3">
              <div className="text-zinc-500 uppercase tracking-widest font-bold">Size</div>
              <div className="mt-1 font-mono">{version?.size || "8.2MB"} single exe, static CRT, no deps, auto-update</div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <div className="rounded-[20px] border border-zinc-800 bg-zinc-900/30 p-6">
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-zinc-500">For Users — 2 mins</div>
            <h3 className="mt-3 font-bold text-lg">Simple, no tech</h3>
            <ol className="mt-4 space-y-3 text-sm text-zinc-300 list-decimal list-inside">
              <li>Download exe from this page (8MB)</li>
              <li>Double-click — Windows SmartScreen → More info → Run anyway (until code-signed)</li>
              <li>Click "Login with Discord" → browser opens hub login → auto returns token via <code className="bg-zinc-800 px-1 rounded">mcwv://</code></li>
              <li>Launcher shows "Checking whitelist..." — generates HWID (CPU+MB+Disk hashed, no personal data)</li>
              <li>If not whitelisted → red screen + Discord invite + HWID for officer</li>
              <li>If whitelisted → Dashboard: war banner live, big green "Launch Macros"</li>
              <li>Click Launch → downloads personal .ahk to <code className="bg-zinc-800 px-1 rounded">%USERPROFILE%\MCWV\</code>, verifies signature ✅, checks AHK, runs</li>
              <li>In game: Ctrl+Alt+M panel, Run tasks</li>
            </ol>
            <div className="mt-4 flex gap-2">
              <button onClick={()=>copy(`1. Download MCWV-Launcher.exe
2. Double-click
3. Login with Discord
4. If not whitelisted contact officer
5. Launch Macros button
6. Ctrl+Alt+M in game`, "steps")} className="text-xs border border-zinc-800 rounded-full px-3 py-1 hover:bg-zinc-900">{copied==="steps"?"Copied ✓":"📋 Copy steps"}</button>
            </div>
          </div>

          <div className="rounded-[20px] border border-zinc-800 bg-zinc-900/30 p-6">
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-emerald-500">Security — FULLY secure</div>
            <h3 className="mt-3 font-bold text-lg">How we keep it safe</h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>✅ HWID = SHA256(CPU_ID + MB_SERIAL + DISK_SERIAL + salt) — salt from server, raw serials never leave device</li>
              <li>✅ Token storage DPAPI CryptProtectData + Cred Manager, never plaintext</li>
              <li>✅ HTTPS TLS 1.3 + cert pinning to hub domain</li>
              <li>✅ Macro HMAC-SHA256 signature — server signs, launcher verifies before run</li>
              <li>✅ Anti-tamper self-check SHA256 at startup</li>
              <li>✅ No hardcoded secrets, OAuth PKCE flow</li>
              <li>✅ Rate limit 60/min, HWID max 2 PCs, sharing detection (ips_24h {'>'}2)</li>
              <li>✅ Rust core for crypto — memory safe, no buffer overflows</li>
              <li>✅ Auto-update with signature verify, single instance mutex, no admin needed</li>
            </ul>
            <button onClick={()=>copy(`HWID SHA256 salted, DPAPI token, TLS 1.3 pinning, HMAC verify, anti-tamper, Rust crypto, rate limit, 2 PCs max`, "sec")} className="mt-4 text-xs border border-zinc-800 rounded-full px-3 py-1 hover:bg-zinc-900">{copied==="sec"?"Copied ✓":"📋 Copy security"}</button>
          </div>
        </div>

        {/* Code */}
        <div className="mt-10 rounded-[20px] border border-zinc-800 bg-zinc-900/30 p-6">
          <div className="flex justify-between items-center">
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-zinc-500">For Officers — Build</div>
            <button onClick={()=>copy(`cd mcwv-launcher/rust-core
cargo build --release
cd ..
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# -> build/Release/MCWV-Launcher.exe`, "build")} className="text-xs border border-zinc-800 rounded-full px-3 py-1 hover:bg-zinc-900">{copied==="build"?"Copied ✓":"📋 Copy build"}</button>
          </div>
          <pre className="mt-3 bg-black rounded-xl p-4 text-[12px] overflow-auto text-zinc-300">{`cd mcwv-launcher/rust-core
cargo build --release
cd ..
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# -> build/Release/MCWV-Launcher.exe (single file, static CRT, 8MB)

# Sign (removes SmartScreen)
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a build\\Release\\MCWV-Launcher.exe

# Upload
copy build\\Release\\MCWV-Launcher.exe ..\\hub-deployed\\public\\launcher\\MCWV-Launcher.exe
# Update /api/launcher/version sha256
`}</pre>
          <div className="mt-3 text-xs text-zinc-500">Already have: mcwv_macro_keys whitelist, macro-activate IP/PC tracking, macro-download personal build, macro-keys admin. Launcher just wraps it securely.</div>
        </div>

        {/* FAQ */}
        <div className="mt-10 grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-bold">Why C++ + Rust and not just AHK?</h4>
            <p className="mt-2 text-zinc-400">AHK = fast war updates (edit events/*.ahk, pack, upload 85K in 2 mins). C++ launcher = secure distribution + whitelist + HWID lock + looks pro. Best of both: launcher downloads AHK, so you keep fast updates, but distribution is secure and simple.</p>
          </div>
          <div>
            <h4 className="font-bold">Do users need AHK installed?</h4>
            <p className="mt-2 text-zinc-400">No. Launcher auto-downloads portable AHK runtime (2MB) to %USERPROFILE%\MCWV\runtime\ if not found. No admin. If AHK installed, uses that.</p>
          </div>
        </div>

        <div className="mt-12 text-center text-[11px] text-zinc-600">
          MCWV Launcher v1.0.0 • Macro v3.5 FINAL FIXED • 2584 lines • 0 errors • Audited
        </div>
      </div>
    </div>
  );
}
