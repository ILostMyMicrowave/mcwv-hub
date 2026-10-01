import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";

let cachedVersion: { version: string; at: number; kill?: any } | null = null;

function getVersionFromTemplate(): string {
  try {
    const tplPath = path.join(process.cwd(), "assets", "mcwv-macros.template.ahk");
    const txt = fs.readFileSync(tplPath, "utf8");
    const m = txt.match(/MACRO_VERSION\s*:=\s*"([^"]+)"/);
    if (m) return m[1];
  } catch {}
  return "2.9";
}

function getKillSwitch(): { kill: boolean; reason?: string } | null {
  // Allow officers to drop a kill.json in assets to disable old versions
  // Example: {"kill":true,"reason":"Critical bug — get v2.9 at /macros","minVersion":"2.9"}
  try {
    const killPath = path.join(process.cwd(), "assets", "macro-kill.json");
    if (fs.existsSync(killPath)) {
      const raw = fs.readFileSync(killPath, "utf8");
      const j = JSON.parse(raw);
      if (j?.kill) return j;
    }
  } catch {}
  // Env override
  if (process.env.MACRO_KILL === "1") {
    return { kill: true, reason: process.env.MACRO_KILL_REASON || "Disabled by officers — get new file at /macros" };
  }
  return null;
}

export async function GET() {
  const killSwitch = getKillSwitch();

  if (cachedVersion && Date.now() - cachedVersion.at < 60_000 && !killSwitch) {
    return NextResponse.json({
      ok: 1,
      version: cachedVersion.version,
      url: "/api/macro-download",
      notes: "Download your personal file at /macros",
    });
  }

  const version = getVersionFromTemplate();
  cachedVersion = { version, at: Date.now(), kill: killSwitch };

  // If kill active, return it — AHK will ExitApp()
  if (killSwitch?.kill) {
    return NextResponse.json({
      ok: 1,
      version,
      kill: true,
      reason: killSwitch.reason || "Disabled — get new file at /macros",
      minVersion: (killSwitch as any).minVersion || version,
      url: "/api/macro-download",
    });
  }

  return NextResponse.json({
    ok: 1,
    version,
    url: "/api/macro-download",
    notes: "Personal build — get your own at /macros",
    changelog: {
      "3.0": "Insane: ScreenBuffer GDI fast capture (10x), MCode pixel compare, Task class, signed official calibs, weekly events auto-discovered + 0 events clean",
      "2.9": "Security: clamp clicks, validate checks, rate-limit screenshots, kill-switch, self-healing, watchdog",
      "2.8": "Auto-update + calibration sharing + screenshot on fail + queue",
      "2.7": "Human mouse, SeeMulti, EnsureGame, queue, natural wording",
    },
  });
}
