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

  /* ---------------- LOAD FROM DATABASE ---------------- */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/global", {
          cache: "no-store",
        });

        const data: GlobalSettings = await res.json();

        setBannerText(data.banner_text ?? "");
        setBannerSpeed(data.banner_speed ?? 18);
        setDiscordLink(data.discord_link ?? "");
        setRequirementsText(data.requirements_text ?? "");

        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    }

    load();
  }, []);

  /* ---------------- AUTO SAVE TO DATABASE ---------------- */
  useEffect(() => {
    if (!loaded) return;

    const timeout = setTimeout(async () => {
      await fetch("/api/settings/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banner_text: bannerText,
          banner_speed: bannerSpeed,
          discord_link: discordLink,
          requirements_text: requirementsText,
        }),
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [bannerText, bannerSpeed, discordLink, requirementsText, loaded]);

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {/* THEME (still personal) */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold mb-4">Theme</h2>

            <div className="grid gap-4 sm:grid-cols-3">
              {themes.map((t) => {
                const active = theme === t.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`rounded-2xl border p-5 text-left ${
                      active
                        ? "border-white/30 bg-white/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${t.color}`} />
                      <p className="font-semibold">{t.name}</p>
                    </div>
                    <p className="text-sm text-zinc-400 mt-2">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* GLOBAL SETTINGS */}
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold">Global Settings</h2>

            <div className="mt-6 space-y-4">
              <textarea
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                className="w-full rounded-xl bg-black/40 p-3 border border-white/10"
                placeholder="Banner text"
              />

              <input
                value={discordLink}
                onChange={(e) => setDiscordLink(e.target.value)}
                className="w-full rounded-xl bg-black/40 p-3 border border-white/10"
                placeholder="Discord link"
              />

              <textarea
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                className="w-full rounded-xl bg-black/40 p-3 border border-white/10"
                rows={6}
                placeholder="Requirements"
              />

              <input
                type="range"
                min={8}
                max={40}
                value={bannerSpeed}
                onChange={(e) => setBannerSpeed(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
