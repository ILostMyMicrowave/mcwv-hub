"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useState } from "react";
import { useTheme, Theme } from "@/hooks/useTheme";

type GlobalSettings = {
  discord_link: string;
  requirements_text: string;
  banner_text: string;
  banner_speed: number;
};

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [bannerText, setBannerText] = useState("");
  const [bannerSpeed, setBannerSpeed] = useState(18);
  const [discordLink, setDiscordLink] = useState("");
  const [requirementsText, setRequirementsText] = useState("");

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const themes: { id: Theme; name: string; desc: string; color: string }[] = [
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

  /* ---------------- LOAD GLOBAL SETTINGS ---------------- */
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/settings/global", {
        cache: "no-store",
      });

      const data: GlobalSettings = await res.json();

      setBannerText(data.banner_text ?? "");
      setBannerSpeed(data.banner_speed ?? 18);
      setDiscordLink(data.discord_link ?? "");
      setRequirementsText(data.requirements_text ?? "");

      setLoaded(true);
    }

    load();
  }, []);

  /* ---------------- SAVE ONE FIELD ---------------- */
  async function saveField(field: Partial<GlobalSettings>) {
    setSaving(Object.keys(field)[0]);

    await fetch("/api/settings/global", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        banner_text: bannerText,
        banner_speed: bannerSpeed,
        discord_link: discordLink,
        requirements_text: requirementsText,
        ...field,
      }),
    });

    setSaving(null);
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-6xl">

          {/* THEME */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold mb-4">Theme</h2>

            <div className="grid gap-4 sm:grid-cols-3">
              {themes.map((t) => {
                const active = theme === t.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`rounded-2xl border p-5 text-left transition-all ${
                      active
                        ? "border-white/40 bg-white/10 scale-[1.03]"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-3 w-3 rounded-full ${t.color} ${
                          active ? "ring-2 ring-white/50" : ""
                        }`}
                      />
                      <p className="font-semibold">{t.name}</p>
                    </div>

                    <p className="mt-2 text-sm text-zinc-400">{t.desc}</p>

                    {active && (
                      <p className="mt-3 text-xs text-emerald-300">
                        Active
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GLOBAL SETTINGS */}
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold">Global Settings</h2>

            {/* BANNER */}
            <div className="mt-6">
              <label className="text-sm font-semibold">Banner Text</label>

              <textarea
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                className="mt-2 w-full rounded-xl bg-black/40 p-3 border border-white/10"
                rows={3}
              />

              <button
                onClick={() => saveField({ banner_text: bannerText })}
                className="mt-2 rounded-xl bg-emerald-400 px-4 py-2 text-black font-semibold"
              >
                {saving === "banner_text" ? "Saving..." : "Save Banner"}
              </button>
            </div>

            {/* SPEED */}
            <div className="mt-6">
              <label className="text-sm font-semibold">
                Banner Speed ({bannerSpeed}s)
              </label>

              <input
                type="range"
                min={8}
                max={40}
                step={1}
                value={bannerSpeed}
                onChange={(e) => setBannerSpeed(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-400"
              />

              {/* SPEED VISUAL BAR */}
              <div className="mt-2 h-2 w-full rounded bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{
                    width: `${((bannerSpeed - 8) / 32) * 100}%`,
                  }}
                />
              </div>

              <button
                onClick={() =>
                  saveField({ banner_speed: bannerSpeed })
                }
                className="mt-3 rounded-xl bg-emerald-400 px-4 py-2 text-black font-semibold"
              >
                Save Speed
              </button>
            </div>

            {/* DISCORD */}
            <div className="mt-6">
              <label className="text-sm font-semibold">Discord Link</label>

              <input
                value={discordLink}
                onChange={(e) => setDiscordLink(e.target.value)}
                className="mt-2 w-full rounded-xl bg-black/40 p-3 border border-white/10"
              />

              <button
                onClick={() =>
                  saveField({ discord_link: discordLink })
                }
                className="mt-2 rounded-xl bg-emerald-400 px-4 py-2 text-black font-semibold"
              >
                Save Discord
              </button>
            </div>

            {/* REQUIREMENTS */}
            <div className="mt-6">
              <label className="text-sm font-semibold">
                Requirements Text
              </label>

              <textarea
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                className="mt-2 w-full rounded-xl bg-black/40 p-3 border border-white/10"
                rows={8}
              />

              <button
                onClick={() =>
                  saveField({
                    requirements_text: requirementsText,
                  })
                }
                className="mt-2 rounded-xl bg-emerald-400 px-4 py-2 text-black font-semibold"
              >
                Save Requirements
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
