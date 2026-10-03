import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const version = "1.0.0";
  const minVersion = "1.0.0";
  const downloadUrl = "/launcher/MCWV-Launcher.exe";
  const sha256 = "TO_BE_FILLED_AFTER_BUILD";
  const size = "8.2MB";
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
