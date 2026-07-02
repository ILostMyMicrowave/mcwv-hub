export default function WarInfoPage() {
  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">
      <div className="mx-auto max-w-6xl">

        {/* 🔥 ACTIVE WAR BANNER */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 mb-8">
          
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 animate-pulse" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">⚔️ ACTIVE WAR</h1>
              <p className="text-zinc-300 mt-1">
                MCWV vs Enemy Clan • Real-time tracking enabled
              </p>
            </div>

            <div className="flex items-center gap-2 text-emerald-300 text-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </div>
          </div>
        </div>

        {/* ⏱ TIMER + QUICK STATS */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">War Timer</p>
            <p className="mt-2 text-3xl font-bold text-emerald-300">
              00:00:00
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              (live timer coming soon)
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Total MCWV Points</p>
            <p className="mt-2 text-3xl font-bold">--</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-zinc-400">Enemy Points</p>
            <p className="mt-2 text-3xl font-bold text-red-300">--</p>
          </div>

        </div>

        {/* ⚔️ CLAN VS CLAN BATTLE LAYOUT */}
        <div className="grid gap-6 md:grid-cols-2">

          {/* 🟢 MCWV SIDE */}
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-6">
            <h2 className="text-xl font-bold text-emerald-300 mb-4">
              🟢 MCWV
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Total Points</span>
                <span className="font-bold">--</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Members Active</span>
                <span className="font-bold">--</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Rank</span>
                <span className="font-bold">#1</span>
              </div>
            </div>

            <div className="mt-6 h-2 w-full rounded-full bg-emerald-900/30 overflow-hidden">
              <div className="h-full w-[60%] bg-emerald-400 animate-pulse" />
            </div>
          </div>

          {/* 🔴 ENEMY SIDE */}
          <div className="rounded-3xl border border-red-400/20 bg-red-500/5 p-6">
            <h2 className="text-xl font-bold text-red-300 mb-4">
              🔴 ENEMY CLAN
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Total Points</span>
                <span className="font-bold">--</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Members Active</span>
                <span className="font-bold">--</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Rank</span>
                <span className="font-bold">#2</span>
              </div>
            </div>

            <div className="mt-6 h-2 w-full rounded-full bg-red-900/30 overflow-hidden">
              <div className="h-full w-[45%] bg-red-400 animate-pulse" />
            </div>
          </div>

        </div>

        {/* 📜 WAR STATUS INFO */}
        <div className="mt-10 space-y-4">

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">📡 Live Tracking</h3>
            <p className="mt-2 text-zinc-400">
              The system is monitoring leaderboard changes every 10 seconds and
              updating war scores in real time.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">⚔️ War Rules</h3>
            <p className="mt-2 text-zinc-400">
              Points gained from Roblox activities are automatically synced and
              counted toward clan performance.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">🔥 Status</h3>
            <p className="mt-2 text-emerald-300 font-medium">
              War system active — updates are live.
            </p>
          </div>

        </div>

      </div>
    </main>
  );
}
