import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const version = "1.0.1";
  const minVersion = "1.0.0";
  const downloadUrl = "/launcher/MCWV-Launcher.exe";
  const sha256 = "426d60dea374dc8107c1a64b8d43439c2e64e2756e6e6be8ab01ef749ad22c15";
  const size = "224KB";
  const changelog = [
    "Secure launcher with account login and whitelist",
    "One-click to get your personal macros",
    "Auto-updates and works with your clan account",
  ];

  return NextResponse.json({
    ok: 1,
    version,
    minVersion,
    downloadUrl,
    sha256,
    size,
    changelog,
    macroVersion: "3.5",
    updatedAt: new Date().toISOString(),
  });
}
