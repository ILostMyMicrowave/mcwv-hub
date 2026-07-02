export default function WarInfoPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold">⚔️ War Info</h1>
          <p className="mt-2 text-zinc-400">
            Live war status, rules, and performance tracking for MCWV.
          </p>
        </div>

        {/* STATUS CARD */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Current War Status</h2>

            <span className="flex items-center gap-2 text-emerald-300 text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              LIVE
            </span>
          </div>

          <p className="mt-4 text-zinc-400">
            No active war detected yet. System is tracking in real-time.
          </p>
        </div>

        {/* STATS GRID */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Total War Points</p>
            <p className="mt-2 text-2xl font-bold">--</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Active Players</p>
            <p className="mt-2 text-2xl font-bold">--</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Last Update</p>
            <p className="mt-2 text-2xl font-bold text-zinc-300">Just now</p>
          </div>

        </div>

        {/* INFO SECTION */}
        <div className="mt-10 space-y-4">

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">📌 How War Tracking Works</h3>
            <p className="mt-2 text-zinc-400">
              The system tracks leaderboard changes every 10 seconds and logs point gains,
              rank changes, and leader shifts in real time.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">🔥 Scoring System</h3>
            <p className="mt-2 text-zinc-400">
              Points are calculated from in-game performance and synced automatically with
              the database leaderboard.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">⚡ Live Updates</h3>
            <p className="mt-2 text-zinc-400">
              Data refreshes every 10 seconds from the API to ensure real-time accuracy
              during wars.
            </p>
          </div>

        </div>

      </div>
    </main>
  );
}
