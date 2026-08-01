import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";

// Serves external images (Hall of Fame, etc.) through our own origin so
// hotlink protection, mixed-content blocking and referer rules can't break
// them. Members only, SSRF-guarded, image-only, size-capped.

const MAX_BYTES = 4 * 1024 * 1024; // stay under Vercel response limits
const TIMEOUT_MS = 8000;
const MAX_REDIRECT_HOPS = 2;

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".localhost")) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

function safeImageUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (isBlockedHost(url.hostname)) return null;
  const port = url.port;
  if (port && port !== "80" && port !== "443") return null;
  return url;
}

async function fetchImage(url: URL, hopsLeft: number): Promise<Response | null> {
  try {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "MCWV-Hub ImageProxy/1.0", Accept: "image/*" },
      cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hopsLeft <= 0) return null;
      let next: URL | null = null;
      try {
        next = safeImageUrl(new URL(location, url).toString());
      } catch {
        next = null;
      }
      if (!next) return null;
      return fetchImage(next, hopsLeft - 1);
    }

    return res;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const raw = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!raw || raw.length > 2048) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const target = safeImageUrl(raw);
  if (!target) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  const upstream = await fetchImage(target, MAX_REDIRECT_HOPS);
  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "Image unavailable" }, { status: 502 });
  }

  const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await upstream.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to read image" }, { status: 502 });
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType.split(";")[0] || "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
