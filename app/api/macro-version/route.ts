import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";

let cachedVersion: { version: string; at: number } | null = null;

function getVersionFromTemplate(): string {
  // Try to read MACRO_VERSION from template file
  try {
    const tplPath = path.join(process.cwd(), "assets", "mcwv-macros.template.ahk");
    const txt = fs.readFileSync(tplPath, "utf8");
    const m = txt.match(/MACRO_VERSION\s*:=\s*"([^"]+)"/);
    if (m) return m[1];
  } catch {}
  return "2.7";
}

export async function GET() {
  // Cache version for 60s to avoid file read on every check
  if (cachedVersion && Date.now() - cachedVersion.at < 60_000) {
    return NextResponse.json({
      ok: 1,
      version: cachedVersion.version,
      url: "/api/macro-download",
      notes: "Download your personal file at /macros",
    });
  }

  const version = getVersionFromTemplate();
  cachedVersion = { version, at: Date.now() };

  return NextResponse.json({
    ok: 1,
    version,
    url: "/api/macro-download",
    notes: "Personal build — get your own at /macros",
    changelog: {
      "2.8": "Auto-update + calibration sharing + screenshot on fail + queue",
      "2.7": "Human mouse, SeeMulti, EnsureGame, queue, natural wording, logo+avatar",
      "2.6": "Fixed Map.Count/Array.Length/.Keys() crashes",
      "2.5": "Natural wording, logo + avatar support",
    },
  });
}
