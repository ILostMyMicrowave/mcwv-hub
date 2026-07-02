export default function Settings() {
  return (
    <main className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl font-bold">Settings</h1>

      <p className="text-zinc-400 mt-2">
        Manage display options, clan preferences, and system configuration.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="font-semibold">Theme</p>
          <p className="text-sm text-zinc-400">Dark mode is currently active</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="font-semibold">API Status</p>
          <p className="text-sm text-emerald-400">Connected</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="font-semibold">Refresh Rate</p>
          <p className="text-sm text-zinc-400">10 seconds</p>
        </div>
      </div>
    </main>
  );
}
