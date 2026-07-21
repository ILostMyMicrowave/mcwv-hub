"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useState } from "react";

type UserSettings = {
  user_id: number;
  theme: string;
};

type GlobalSettings = {
  discord_link: string;
  requirements_text: string;
  banner_text: string;
  banner_speed: number;
  updated_at: string | null;
};

type UserRole = "member" | "officer" | "owner" | null;

const THEMES = [
  { id: "default", name: "Default", description: "Classic MCWV dark theme" },
  { id: "ice", name: "Ice", description: "Cool blue tones" },
  { id: "inferno", name: "Inferno", description: "Warm red/orange tones" },
] as const;

export default function SettingsPage() {
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [formData, setFormData] = useState({
    theme: "default",
    discord_link: "",
    requirements_text: "",
    banner_text: "",
    banner_speed: 18,
  });
  const [focusedField, setFocusedField] = useState<string | null>(null);

  async function loadSettings() {
    try {
      const [userRes, globalRes, roleRes] = await Promise.all([
        fetch("/api/settings/user", { cache: "no-store" }),
        fetch("/api/settings/global", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      const [userData, globalData, roleData] = await Promise.all([
        userRes.json(),
        globalRes.json(),
        roleRes.json(),
      ]);

      if (userData.user_id) {
        setUserSettings(userData);
        setFormData((prev) => ({ ...prev, theme: userData.theme }));
      }
      if (globalData.discord_link !== undefined) {
        setGlobalSettings(globalData);
        setFormData((prev) => ({
          ...prev,
          discord_link: globalData.discord_link,
          requirements_text: globalData.requirements_text,
          banner_text: globalData.banner_text,
          banner_speed: globalData.banner_speed,
        }));
      }
      if (roleData.user?.role) {
        setUserRole(roleData.user.role);
      }
    } catch (err) {
      console.error("[settings] load error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSave(type: "theme" | "global") {
    setSaving(type);
    setSaveStatus(null);

    try {
      const endpoint = type === "theme" ? "/api/user/theme" : "/api/settings/global";
      const payload = type === "theme"
        ? { theme: formData.theme }
        : {
            discord_link: formData.discord_link,
            requirements_text: formData.requirements_text,
            banner_text: formData.banner_text,
            banner_speed: formData.banner_speed,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to save");
      }

      setSaveStatus({ type: "success", message: `${type === "theme" ? "Theme" : "Global settings"} saved successfully!` });
      if (type === "theme") {
        await loadSettings();
      }
    } catch (err) {
      setSaveStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-10">
          <div className="space-y-6 animate-pulse">
            <div className="rounded-3xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="h-6 w-1/4 rounded bg-zinc-800/50" />
              <div className="mt-4 h-4 w-3/4 rounded bg-zinc-800/50" />
            </div>
            <div className="rounded-3xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="h-6 w-1/3 rounded bg-zinc-800/50" />
              <div className="mt-4 space-y-3">
                <div className="h-10 w-full rounded bg-zinc-800/50" />
                <div className="h-10 w-full rounded bg-zinc-800/50" />
              </div>
            </div>
            <div className="rounded-3xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="h-6 w-1/3 rounded bg-zinc-800/50" />
              <div className="mt-4 space-y-3">
                <div className="h-10 w-full rounded bg-zinc-800/50" />
                <div className="h-10 w-full rounded bg-zinc-800/50" />
                <div className="h-10 w-full rounded bg-zinc-800/50" />
                <div className="h-10 w-full rounded bg-zinc-800/50" />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--background)" }}>
      <Navbar />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-10">
        <div className="mb-8" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
          <p className="mt-2 text-zinc-400">Manage your personal preferences and clan settings.</p>
        </div>

        {saveStatus && (
          <div
            className="mb-6 rounded-2xl border p-4 animate-fade-in"
            style={{
              background: saveStatus.type === "success" ? "rgba(52, 211, 153, 0.15)" : "rgba(239, 68, 68, 0.15)",
              borderColor: saveStatus.type === "success" ? "rgba(52, 211, 153, 0.4)" : "rgba(239, 68, 68, 0.4)",
              color: saveStatus.type === "success" ? "#34d399" : "#f87171",
            }}
          >
            {saveStatus.message}
          </div>
        )}

        <section
          className="rounded-3xl border p-4 sm:p-6"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            animation: "fadeInUp 0.5s ease-out forwards",
            animationDelay: "0.1s",
            opacity: 0,
          }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Personal Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Theme</label>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, theme: theme.id }))}
                    className={`relative rounded-2xl border p-4 transition-all duration-300 text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 ${formData.theme === theme.id ? "ring-2 scale-[1.02]" : "hover:border-primary/50 hover:bg-primary/5"}`}
                    style={{
                      background: "var(--card)",
                      borderColor: formData.theme === theme.id ? "var(--primary)" : "var(--border)",
                      borderWidth: formData.theme === theme.id ? "2px" : "1px",
                      color: "var(--foreground)",
                      focusRingColor: "var(--primary)",
                    }}
                    onFocus={() => setFocusedField(`theme-${theme.id}`)}
                    onBlur={() => setFocusedField(null)}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={theme.id}
                      checked={formData.theme === theme.id}
                      onChange={() => setFormData((prev) => ({ ...prev, theme: theme.id }))}
                      className="sr-only"
                    />
                    <div className="font-semibold">{theme.name}</div>
                    <div className="mt-1 text-sm text-zinc-400">{theme.description}</div>
                    {formData.theme === theme.id && (
                      <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--primary)", color: "#000" }}>
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSave("theme")}
              disabled={saving === "theme"}
              className="w-full sm:w-auto rounded-full px-6 py-3 text-sm font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: "var(--primary)",
                color: "#000",
              }}
            >
              {saving === "theme" ? "Saving..." : "Save Theme"}
            </button>
          </div>
        </section>

        {userRole === "officer" || userRole === "owner" ? (
          <section
            className="mt-6 rounded-3xl border p-4 sm:p-6"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              animation: "fadeInUp 0.5s ease-out forwards",
              animationDelay: "0.2s",
              opacity: 0,
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Global Settings</h2>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--primary)", color: "#000" }}>
                {userRole}
              </span>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="discord_link" className="block text-sm font-medium text-zinc-300">
                  Discord Invite Link
                </label>
                <input
                  id="discord_link"
                  type="url"
                  value={formData.discord_link}
                  onChange={(e) => setFormData((prev) => ({ ...prev, discord_link: e.target.value }))}
                  onFocus={() => setFocusedField("discord_link")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="https://discord.gg/..."
                  className="mt-2 w-full rounded-xl border bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-500 transition-all duration-200 focus:outline-none focus:ring-2"
                  style={{
                    borderColor: focusedField === "discord_link" ? "var(--primary)" : "var(--border)",
                    focusRingColor: "var(--primary)",
                  }}
                />
                <p className="mt-1 text-xs text-zinc-400">Permanent invite link for the clan Discord server.</p>
              </div>

              <div>
                <label htmlFor="requirements_text" className="block text-sm font-medium text-zinc-300">
                  Requirements Text
                </label>
                <textarea
                  id="requirements_text"
                  value={formData.requirements_text}
                  onChange={(e) => setFormData((prev) => ({ ...prev, requirements_text: e.target.value }))}
                  onFocus={() => setFocusedField("requirements_text")}
                  onBlur={() => setFocusedField(null)}
                  rows={3}
                  placeholder="e.g. Must have 10M+ battle points, active daily, Discord required..."
                  className="mt-2 w-full rounded-xl border bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-500 transition-all duration-200 focus:outline-none focus:ring-2 resize-none"
                  style={{
                    borderColor: focusedField === "requirements_text" ? "var(--primary)" : "var(--border)",
                    focusRingColor: "var(--primary)",
                    fontFamily: "inherit",
                  }}
                />
                <p className="mt-1 text-xs text-zinc-400">Shown on the clan profile and recruitment pages.</p>
              </div>

              <div>
                <label htmlFor="banner_text" className="block text-sm font-medium text-zinc-300">
                  Banner Text
                </label>
                <input
                  id="banner_text"
                  type="text"
                  value={formData.banner_text}
                  onChange={(e) => setFormData((prev) => ({ ...prev, banner_text: e.target.value }))}
                  onFocus={() => setFocusedField("banner_text")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Welcome to MCWV! Check #announcements for updates."
                  className="mt-2 w-full rounded-xl border bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-500 transition-all duration-200 focus:outline-none focus:ring-2"
                  style={{
                    borderColor: focusedField === "banner_text" ? "var(--primary)" : "var(--border)",
                    focusRingColor: "var(--primary)",
                  }}
                />
                <p className="mt-1 text-xs text-zinc-400">Scrolling banner text displayed on the dashboard.</p>
              </div>

              <div>
                <label htmlFor="banner_speed" className="block text-sm font-medium text-zinc-300">
                  Banner Speed
                </label>
                <input
                  id="banner_speed"
                  type="number"
                  min="1"
                  max="60"
                  value={formData.banner_speed}
                  onChange={(e) => setFormData((prev) => ({ ...prev, banner_speed: Math.max(1, Math.min(60, Number(e.target.value))) }))}
                  onFocus={() => setFocusedField("banner_speed")}
                  onBlur={() => setFocusedField(null)}
                  className="mt-2 w-full max-w-xs rounded-xl border bg-zinc-950/50 px-4 py-3 text-white transition-all duration-200 focus:outline-none focus:ring-2"
                  style={{
                    borderColor: focusedField === "banner_speed" ? "var(--primary)" : "var(--border)",
                    focusRingColor: "var(--primary)",
                  }}
                />
                <p className="mt-1 text-xs text-zinc-400">Scroll speed in pixels per second (1-60).</p>
              </div>

              <button
                type="button"
                onClick={() => handleSave("global")}
                disabled={saving === "global"}
                className="w-full sm:w-auto rounded-full px-6 py-3 text-sm font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: "var(--primary)",
                  color: "#000",
                }}
              >
                {saving === "global" ? "Saving..." : "Save Global Settings"}
              </button>
            </div>
          </section>
        ) : (
          <section
            className="mt-6 rounded-3xl border p-4 sm:p-6"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              animation: "fadeInUp 0.5s ease-out forwards",
              animationDelay: "0.2s",
              opacity: 0,
            }}
          >
            <div className="flex items-center gap-3 text-zinc-400">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>Global settings are only available to officers and owners.</p>
            </div>
          </section>
        )}

        <div className="mt-10 rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">Available Themes</h3>
          <p className="mt-2 text-sm text-zinc-400">Themes apply globally across the dashboard. Changes take effect immediately.</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </main>
  );
}
