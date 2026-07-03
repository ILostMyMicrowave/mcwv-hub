"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useState } from "react";
import { useTheme, Theme } from "@/hooks/useTheme";

const BANNER_KEY = "mcwv_home_banner";
const DISCORD_KEY = "mcwv_discord_link";
const REQUIREMENTS_KEY = "mcwv_requirements_text";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [bannerText, setBannerText] = useState(
    "Recruiting now!! Join the Discord and help push us to the top."
  );
  const [discordLink, setDiscordLink] = useState("");
  const [requirementsText, setRequirementsText] = useState(
    "Be respectful\nStay active in wars\nJoin the Discord when you can."
  );
  const [hydrated, setHydrated] = useState(false);

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

  useEffect(() => {
    try {
      const storedBanner = window.localStorage.getItem(BANNER_KEY);
      const storedDiscord = window.localStorage.getItem(DISCORD_KEY);
      const storedRequirements = window.localStorage.getItem(REQUIREMENTS_KEY);

      if (storedBanner !== null) setBannerText(storedBanner);
      if (storedDiscord !== null) setDiscordLink(storedDiscord);
      if (storedRequirements !== null) setRequirementsText(storedRequirements);
    } catch {
      // ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(BANNER_KEY, bannerText);
      window.localStorage.setItem(DISCORD_KEY, discordLink);
      window.localStorage.setItem(REQUIREMENTS_KEY, requirementsText);
    } catch {
      // ignore storage errors
    }
  }, [bannerText, discordLink, requirementsText, hydrated]);

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="mt-2 text-zinc-400">
              Manage display options, clan preferences, and system configuration.
            </p>
          </div>

          {/* THEME SECTION */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Theme</h2>
              <p className="text-xs text-zinc-500">
                Current: <span className="text-zinc-300">{theme}</span>
              </p>
            </div>

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

                    <p className="mt-2 text-sm text-zinc-400">{t.desc}</p>

                    {active && (
                      <p className="mt-3 text-xs text-emerald-300">
                        Currently active
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* HOME PAGE CONTENT */}
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-xl font-bold">Home Page Content</h2>
            <p className="mt-2 text-sm text-zinc-400">
              These settings control the home page banner, Discord button, and clan requirements.
            </p>

            <div className="mt-6 grid gap-6">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-200">
                  Scrolling banner text
                </span>
                <input
                  type="text"
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder="Recruiting now!!"
                />
                <span className="mt-2 block text-xs text-zinc-500">
                  Used in the moving banner on the home page.
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-200">
                  Discord invite link
                </span>
                <input
                  type="url"
                  value={discordLink}
                  onChange={(e) => setDiscordLink(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder="https://discord.gg/yourinvite"
                />
                <span className="mt-2 block text-xs text-zinc-500">
                  Used for the Discord button on the home page.
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-200">
                  Clan requirements
                </span>
                <textarea
                  value={requirementsText}
                  onChange={(e) => setRequirementsText(e.target.value)}
                  rows={6}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder={"Be respectful\nStay active in wars\nJoin the Discord when you can."}
                />
                <span className="mt-2 block text-xs text-zinc-500">
                  Put one requirement per line.
                </span>
              </label>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Banner preview
                </p>
                <p className="mt-2 text-sm text-white">
                  {bannerText || "Recruiting now!!"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Discord preview
                </p>
                <p className="mt-2 break-all text-sm text-white">
                  {discordLink || "No link set"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Requirements preview
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-white">
                  {requirementsText || "No requirements set"}
                </p>
              </div>
            </div>
          </div>

          {/* OTHER SETTINGS */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="font-semibold">API Status</p>
              <p className="text-sm text-emerald-400">Connected</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="font-semibold">Refresh Rate</p>
              <p className="text-sm text-zinc-400">10 seconds</p>
            </div>
          </div>

          <p className="mt-6 text-xs text-zinc-500">
            Settings save automatically on this device.
          </p>
        </div>
      </main>
    </>
  );
}
