import Navbar from "@/components/Navbar";

async function getLeaderboardPreview() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/leaderboard`,
      { cache: "no-store" }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return Array.isArray(data.data) ? data.data.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const top = await getLeaderboardPreview();

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      {/* HERO */}
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          LIVE CLAN SYSTEM
        </div>

        <h1 className="text-5xl font-bold sm:text-6xl">
          MCWV Hub
        </h1>

        <p className="mt-4 max-w-2xl text-zinc-400">
          Real-time leaderboard tracking, war stats, and clan performance analytics.
        </p>

        <a
          href="/leaderboard"
          className="mt-8 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black hover:bg-emerald-400 transition"
        >
          View Leaderboard
        </a>
      </section>

      {/* STATS GRID */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-zinc-400">Live Players</p>
          <p className="mt-2 text-2xl font-bold">{top.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-zinc-400">System Status</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">LIVE</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-zinc-400">Tracking</p>
          <p className="mt-2 text-2xl font-bold">ACTIVE</p>
        </div>
      </section>

      {/* TOP 5 PREVIEW */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-4 text-xl font-semibold">Top Players</h2>

        <div className="space-y-2">
          {top.map((p: any) => (
            <div
              key={p.user_id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="text-zinc-300">{p.name}</span>
              <span className="font-bold">{p.points}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
