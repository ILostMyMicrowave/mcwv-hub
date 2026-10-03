import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const version = "1.0.1";
  const minVersion = "1.0.0";
  const downloadUrl = "/launcher/MCWV-Launcher.exe";
  const sha256 = "3f77de3e90a2d72c75e9c753283c24ae2866ce24d2f2e088445380378bb4b791";
  const size = "396KB";
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
