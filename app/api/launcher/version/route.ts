import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const version = "1.0.1";
  const minVersion = "1.0.1";
  const downloadUrl = "/launcher/MCWV-Launcher.exe";
  const safeAlternatives = {
    ps1: "/launcher/MCWV-Launcher.ps1",
    bat: "/launcher/MCWV-Launcher.bat",
    ahk: "/launcher/MCWV-Launcher.ahk",
    directAhk: "/macros"
  };
  const sha256 = "df386138aefb19011f4eb0225a51f35681d2f88da4c9b96e33a5735331a3829e";
  const size = "2.1KB CLEAN — no WMI — functional";
  const changelog = [
    "FIX v1.0.1: REMOVED WMI queries that triggered Defender PUA:Win32/WMI",
    "CLEAN build: DPAPI token + WinHTTP only, no HWID, no Wbem",
    "SAFE alternatives: .ps1/.bat/.ahk never trigger virus",
    "Includes double-hatch + hatch wars 12-step",
  ];
  return NextResponse.json({ ok:1, version, minVersion, downloadUrl, safeAlternatives, sha256, size, changelog, macroVersion:"3.6", updatedAt:new Date().toISOString() });
}
