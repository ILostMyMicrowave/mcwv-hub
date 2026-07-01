import Navbar from "@/components/Navbar";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      {/* HERO */}
      <section className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6 lg:px-10">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          MCWV Hub
        </h1>

        <p className="mt-4 max-w-2xl text-zinc-400">
          Live clan stats, leaderboard tracking, and war progress all in one place.
        </p>

        <a
          href="/leaderboard"
          className="mt-8 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
        >
          View Leaderboard
        </a>
      </section>

      {/* QUICK STATS */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pb-16 sm:grid-cols-3 sm:px-6 lg:px-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-zinc-400">Total Points</p>
          <p className="mt-2 text-2xl font-bold">—</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-zinc-400">War Status</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">LIVE</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-zinc-400">Players</p>
          <p className="mt-2 text-2xl font-bold">—</p>
        </div>
      </section>
    </main>
  );
}
