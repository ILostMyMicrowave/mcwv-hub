import LandingClient from "@/components/LandingClient";
import { getLandingInitial } from "@/lib/landingInitial";

// The landing page reads the session (and the shared leaderboard cache) so it
// must render per-request — never statically, never edge-cached with data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server component: renders the landing shell WITH the critical data
 * (leaderboard stats, banner, my-status, navbar user) baked into the HTML,
 * so the page paints with real numbers on the first frame instead of zeros
 * that fill in 1–3 s later via client-side fetches.
 *
 * Everything inside getLandingInitial() is fail-soft; a slow/failed slice
 * renders as null and the client component falls back to its normal fetch.
 */
export default async function HomePage() {
  const initial = await getLandingInitial();
  return <LandingClient initial={initial} />;
}
