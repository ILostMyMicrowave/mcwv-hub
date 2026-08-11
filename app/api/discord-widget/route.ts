import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVER_ID = "1501608673250640055";
const WIDGET_URL = `https://discord.com/api/guilds/${SERVER_ID}/widget.json`;

// Cache for 30 seconds so we don't hammer Discord on every page load.
let cache: { at: number; data: unknown } | null = null;
const CACHE_MS = 30_000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json({ success: true, ...cache.data as object }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const res = await fetch(WIDGET_URL, {
      headers: { "User-Agent": "MCWV-Hub/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Discord returned HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    cache = { at: Date.now(), data };

    return NextResponse.json({ success: true, ...data }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not reach Discord" },
      { status: 502 }
    );
  }
}
