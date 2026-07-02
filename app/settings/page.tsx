"use client";

import { useTheme, Theme } from "@/hooks/useTheme";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const themes: {
    id: Theme;
    name: string;
    desc: string;
    color: string;
  }[] = [
    {
      id: "default",
      name: "Default",
      desc: "Classic dark MCWV theme",
      color: "bg-emerald-400",
    },
    {
      id: "ice",
      name: "Ice",
      desc: "Blue frost battlefield theme",
      color: "bg-sky-400",
    },
    {
      id: "inferno",
      name: "Inferno",
      desc: "Fire & war intensity theme",
      color: "bg-red-500",
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl font-bold">Settings</h1>

      <p className="text-zinc-400 mt-2">
        Manage display options, clan preferences, and system configuration.
      </p>

      {/* THEME SECTION */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Theme</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {themes.map((t) => {
            const active = theme === t.id;

            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`
                  rounded-2xl border p-5 text-left transition-all duration-300
                  ${
                    active
                      ? "border-white/30 bg-white/10 shadow-lg scale-[1.02]"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${t.color}`} />
                  <p className="font-semibold">{t.name}</p>
                </div>

                <p className="text-sm text-zinc-400 mt-2">{t.desc}</p>

                {active && (
                  <p className="text-xs text-emerald-300 mt-3">
                    Currently active
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* DEBUG */}
        <p className="mt-6 text-xs text-zinc-500">
          Active theme: {theme}
        </p>
      </div>

      {/* OTHER SETTINGS */}
      <div className="mt-10 space-y-4">
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
