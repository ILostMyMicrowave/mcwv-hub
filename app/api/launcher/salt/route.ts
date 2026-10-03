import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

const SALT_V1 = process.env.MCWV_HWID_SALT || "mcwv-salt-v1-2026-change-in-prod";

export async function GET() {
  return NextResponse.json({
    ok: 1,
    salt: SALT_V1,
    version: 1,
  });
}
