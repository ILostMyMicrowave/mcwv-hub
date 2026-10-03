import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const version = "1.0.0";
  const minVersion = "1.0.0";
  const downloadUrl = "/launcher/MCWV-Launcher.exe";
  const sha256 = "8ead495a3a9d4aee8a1be050c145bdf697341d174832b893e11e80ea5b5b29d4";
  const size = "396KB";
  const changelog = [
    "Initial release — secure C++ launcher with HWID lock",
    "DPAPI token storage, HMAC macro verification",
    "Auto AHK runtime download, single exe no installer",
    "War banner live, private server link",
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
