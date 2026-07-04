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

type SaveKey = "banner_text" | "banner_speed" | "discord_link" | "requirements_text";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [bannerText, setBannerText] = useState("");
  const [bannerSpeed, setBannerSpeed] = useState(18);
  const [discordLink, setDiscordLink] = useState("");
  const [requirementsText, setRequirementsText] = useState("");

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<SaveKey | null>(null);
  const [status, setStatus] = useState<string>("");

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
    async function load() {
      try {
        const res = await fetch("/api/settings/global", { cache: "no-store" });
        const data: GlobalSettings = await res.json();

        setBannerText(data.banner_text ?? "");
        setBannerSpeed(data.banner_speed ?? 18);
        setDiscordLink(data.discord_link ?? "");
        setRequirementsText(data.requirements_text ?? "");
        setLoaded(true);
      } catch {
        setStatus("Failed to load settings");
        setLoaded(true);
      }
    }

    load();
  }, []);

  async function saveField(field: SaveKey) {
    setSaving(field);
    setStatus("");

    try {
      const res = await fetch("/api/settings/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banner_text: bannerText,
          banner_speed: bannerSpeed,
          discord_link: discordLink,
          requirements_text: requirementsText,
        }),
      });

      if (!res.ok) {
        throw new Error("save failed");
      }

      setStatus("Saved");
    } catch {
      setStatus("Save failed");
    } finally {
      setSaving(null);
      window.setTimeout(() => setStatus(""), 1500);
    }
  }

  const speedPercent = Math.min(100, Math.max(0, ((bannerSpeed - 8) / 32) * 100));

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="mt-2 text-zinc-400">
              Manage display options, clan preferences, and system configuration.
            </p>
          </div>

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
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`
                      rounded-2xl border p-5 text-left transition-all duration-300
                      ${
                        active
                          ? "border-white/40 bg-white/10 shadow-lg scale-[1.03]"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-3 w-3 rounded-full ${t.color} ${
                          active ? "ring-2 ring-white/60" : ""
                        }`}
                      />
                      <p className="font-semibold">{t.name}</p>
                    </div>

                    <p className="mt-2 text-sm text-zinc-400">{t.desc}</p>

                    {active && (
                      <p className="mt-3 text-xs text-emerald-300">Active</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Global Settings</h2>
              <p className="text-xs text-zinc-500">{status}</p>
            </div>

            <div className="mt-6 space-y-8">
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Scrolling banner text
                </label>
                <textarea
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder="Recruiting now!!"
                />
                <button
                  type="button"
                  onClick={() => saveField("banner_text")}
                  disabled={!loaded || saving !== null}
                  className="mt-3 rounded-2xl bg-emerald-400 px-4 py-2 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === "banner_text" ? "Saving..." : "Save Banner"}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Banner speed ({bannerSpeed}s)
                </label>

                <input
                  type="range"
                  min={8}
                  max={40}
                  step={1}
                  value={bannerSpeed}
                  onChange={(e) => setBannerSpeed(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${speedPercent}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>Fast</span>
                  <span>{bannerSpeed}s</span>
                  <span>Slow</span>
                </div>

                <button
                  type="button"
                  onClick={() => saveField("banner_speed")}
                  disabled={!loaded || saving !== null}
                  className="mt-3 rounded-2xl bg-emerald-400 px-4 py-2 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === "banner_speed" ? "Saving..." : "Save Speed"}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Discord invite link
                </label>
                <input
                  type="url"
                  value={discordLink}
                  onChange={(e) => setDiscordLink(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder="https://discord.gg/yourinvite"
                />
                <button
                  type="button"
                  onClick={() => saveField("discord_link")}
                  disabled={!loaded || saving !== null}
                  className="mt-3 rounded-2xl bg-emerald-400 px-4 py-2 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === "discord_link" ? "Saving..." : "Save Discord"}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                  Requirements text
                </label>
                <textarea
                  value={requirementsText}
                  onChange={(e) => setRequirementsText(e.target.value)}
                  rows={10}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder={`# Heading
## Subheading
**bold**
*italic*
__underline__`}
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Supports headings, subheadings, bold, italics, underline, and line breaks.
                </p>
                <button
                  type="button"
                  onClick={() => saveField("requirements_text")}
                  disabled={!loaded || saving !== null}
                  className="mt-3 rounded-2xl bg-emerald-400 px-4 py-2 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === "requirements_text" ? "Saving..." : "Save Requirements"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
