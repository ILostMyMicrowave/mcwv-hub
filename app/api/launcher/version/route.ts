import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const version = "1.0.2";
  const minVersion = "1.0.2";
  const downloadUrl = "/launcher/MCWV-Launcher.exe";
  const safeAlternatives = {
    ps1: "/launcher/MCWV-Launcher.ps1",
    bat: "/launcher/MCWV-Launcher.bat",
    ahk: "/launcher/MCWV-Launcher.ahk",
    directAhk: "/macros"
  };
  const sha256 = "97397a365c217402d1bbef1f192265a069df2d7a91936179a2d88fbfe5f65b16";
  const size = "230KB";
  const changelog = [
    "FIX v1.0.1: REMOVED WMI queries that triggered Defender PUA:Win32/WMI",
    "CLEAN build: DPAPI token + WinHTTP only, no HWID, no Wbem",
    "SAFE alternatives: .ps1/.bat/.ahk never trigger virus",
    "Includes double-hatch + hatch wars 12-step",
  ];
  return NextResponse.json({ ok:1, version, minVersion, downloadUrl, safeAlternatives, sha256, size, changelog, macroVersion:"3.6", updatedAt:new Date().toISOString() });
}
