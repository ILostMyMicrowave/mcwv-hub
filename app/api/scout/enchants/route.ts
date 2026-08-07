import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { slimEnchantFamily, type BuilderEnchantFamily } from "@/lib/scoutAnalysis";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PS99 = process.env.PS99_API ?? "https://ps99.biggamesapi.io";
const TTL_MS = 30 * 60 * 1000;

type Cache = { at: number; payload: { syncedAt: string; families: BuilderEnchantFamily[] } } | null;
const globalCache = globalThis as unknown as { _mcwv_enchants_cache?: Cache };

async function loadFamilies(): Promise<{ syncedAt: string; families: BuilderEnchantFamily[] }> {
  const cached = globalCache._mcwv_enchants_cache;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.payload;

  const res = await fetch(`${PS99}/api/collection/Enchants`, {
    headers: { "User-Agent": "MCWV-Hub/1.0", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`enchants fetch failed (${res.status})`);
  const body: unknown = await res.json().catch(() => null);
  const data = body && typeof body === "object" ? (body as Record<string, unknown>).data : null;
  if (!Array.isArray(data)) throw new Error("enchants payload unexpected");

  const families = (data as Record<string, unknown>[])
    .map((entry) => slimEnchantFamily(String(entry.configName ?? ""), entry.configData))
    .filter((f) => f.id && f.tiers.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = { syncedAt: new Date().toISOString(), families };
  globalCache._mcwv_enchants_cache = { at: Date.now(), payload };
  return payload;
}

// Owner-only: enchant tier bible for the builder (server-cached 30 min).
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "owner") {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const payload = await loadFamilies();
    return NextResponse.json({ success: true, ...payload });
  } catch (err) {
    console.error("[scout/enchants] fetch failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "fetch_failed" },
      { status: 500 }
    );
  }
}
