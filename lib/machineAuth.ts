import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function timingSafeStringEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function headerOrBearer(request: Request, headerName: string): string {
  const header = request.headers.get(headerName)?.trim() ?? "";
  if (header) return header;
  const bearer = request.headers.get("authorization") ?? "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  return "";
}

export function getBotAdminKey(): string {
  return (
    process.env.BOT_ADMIN_API_KEY?.trim() ||
    process.env.ADMIN_API_KEY?.trim() ||
    ""
  );
}

export function isBotAdminAuthorized(request: Request): boolean {
  const expected = getBotAdminKey();
  if (!expected) return false;
  const provided = headerOrBearer(request, "x-admin-api-key");
  return timingSafeStringEqual(provided, expected);
}

export function unauthorizedMachineResponse() {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}
