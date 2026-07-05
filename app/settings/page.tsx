"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useMemo, useState } from "react";
import { useTheme, Theme } from "@/hooks/useTheme";

type GlobalSettings = {
  discord_link: string;
  requirements_text: string;
  banner_text: string;
  banner_speed: number;
};

type SaveKey =
  | "banner_text"
  | "banner_speed"
  | "discord_link"
  | "requirements_text";

type AppUser = {
  id: number;
  username: string;
  discord_id: string | number | null;
  role: "member" | "officer" | "owner";
};

type AdminUsersResponse = {
  users: AppUser[];
};

type AuthMeResponse =
  | { user?: AppUser | null; role?: AppUser["role"] | null }
  | AppUser
  | null;

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [role, setRole] = useState<AppUser["role"] | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const [members, setMembers] = useState<AppUser[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesStatus, setRolesStatus] = useState("");

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

  const canEditGlobal = role === "officer" || role === "owner";
  const canManageRoles = role === "owner";

  const pillStyle = useMemo(() => {
    if (theme === "ice") {
      return {
        background: "rgba(56, 189, 248, 0.12)",
        border: "1px solid rgba(56, 189, 248, 0.24)",
        color: "var(--primary)",
      };
    }

    if (theme === "inferno") {
      return {
        background: "rgba(239, 68, 68, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.24)",
        color: "var(--primary)",
      };
    }

    return {
      background: "rgba(52, 211, 153, 0.10)",
      border: "1px solid rgba(52, 211, 153, 0.22)",
      color: "var(--primary)",
    };
  }, [theme]);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, authRes] = await Promise.all([
          fetch("/api/settings/global", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);

        if (settingsRes.ok) {
          const data: GlobalSettings = await settingsRes.json();
          setBannerText(data.banner_text ?? "");
          setBannerSpeed(data.banner_speed ?? 18);
          setDiscordLink(data.discord_link ?? "");
          setRequirementsText(data.requirements_text ?? "");
        }

        if (authRes.ok) {
          const authData: AuthMeResponse = await authRes.json();

          const resolvedUser =
            authData && "user" in authData
              ? authData.user ?? null
              : authData && "role" in authData
              ? (authData as AppUser)
              : (authData as AppUser | null);

          if (resolvedUser && typeof resolvedUser === "object") {
            setCurrentUser(resolvedUser);
            setRole(resolvedUser.role ?? "member");
          } else {
            setCurrentUser(null);
            setRole("member");
          }
        } else {
          setCurrentUser(null);
          setRole("member");
        }

        setLoaded(true);
      } catch {
        setStatus("Failed to load settings");
        setLoaded(true);
      }
    }

    load();
  }, []);

  useEffect(() => {
    async function loadMembers() {
      if (!canManageRoles) {
        setMembers([]);
        return;
      }

      try {
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        if (!res.ok) {
          setMembers([]);
          return;
        }

        const data: AdminUsersResponse = await res.json();
        setMembers(Array.isArray(data.users) ? data.users : []);
      } catch {
        setMembers([]);
      }
    }

    loadMembers();
  }, [canManageRoles]);

  async function saveField(field: SaveKey) {
    if (!canEditGlobal) {
      setStatus("You do not have permission to edit global settings");
      return;
    }

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

  async function updateRole(userId: number, nextRole: "member" | "officer") {
    if (!canManageRoles) {
      setRolesStatus("You do not have permission to manage roles");
      return;
    }

    setRolesLoading(true);
    setRolesStatus("");

    try {
      const res = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          role: nextRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "role update failed");
      }

      setRolesStatus("Role updated");

      const refreshed = await fetch("/api/admin/users", { cache: "no-store" });
      if (refreshed.ok) {
        const data: AdminUsersResponse = await refreshed.json();
        setMembers(Array.isArray(data.users) ? data.users : []);
      }
    } catch {
      setRolesStatus("Role update failed");
    } finally {
      setRolesLoading(false);
      window.setTimeout(() => setRolesStatus(""), 1500);
    }
  }

  const speedPercent = Math.min(100, Math.max(0, ((bannerSpeed - 8) / 32) * 100));

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;

    return members.filter((m) => {
      const username = (m.username || "").toLowerCase();
      const discord = String(m.discord_id ?? "").toLowerCase();
      const roleText = String(m.role ?? "").toLowerCase();
      return username.includes(q) || discord.includes(q) || roleText.includes(q);
    });
  }, [members, memberSearch]);

  if (role === "member") {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-black px-4 py-8 text-white">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="mt-3 text-zinc-400">
              You can change your theme here. Global settings are available to officers
              and above.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
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

                      {active && <p className="mt-3 text-xs text-emerald-300">Active</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

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
            {currentUser && (
              <p className="mt-2 text-xs text-zinc-500">
                Logged in as{" "}
                <span className="text-zinc-300">
                  {currentUser.username} ({role})
                </span>
              </p>
            )}
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

                    {active && <p className="mt-3 text-xs text-emerald-300">Active</p>}
                  </button>
                );
              })}
            </div>
          </div>

          {canEditGlobal ? (
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
                    Supports headings, subheadings, bold, italics, underline, and line
                    breaks.
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
          ) : null}

          {canManageRoles ? (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Officer Management</h2>
                <p className="text-xs text-zinc-500">{rolesStatus}</p>
              </div>

              <p className="mt-2 text-sm text-zinc-400">
                Promote or demote members. Only the owner can see this section.
              </p>

              <div className="mt-5">
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
                  placeholder="Search by username, Discord ID, or role"
                />
              </div>

              <div className="mt-5 space-y-3">
                {filteredMembers.length === 0 ? (
                  <p className="text-sm text-zinc-400">No members found.</p>
                ) : (
                  filteredMembers.map((member) => {
                    const isOfficer = member.role === "officer";
                    const isOwner = member.role === "owner";

                    return (
                      <div
                        key={member.id}
                        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-semibold text-white">
                            {member.username}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Discord ID: {member.discord_id ?? "—"} · Role:{" "}
                            <span className="text-zinc-300">{member.role}</span>
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {!isOwner && !isOfficer && (
                            <button
                              type="button"
                              onClick={() => updateRole(member.id, "officer")}
                              disabled={rolesLoading}
                              className="rounded-2xl bg-sky-400 px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Promote to Officer
                            </button>
                          )}

                          {isOfficer && (
                            <button
                              type="button"
                              onClick={() => updateRole(member.id, "member")}
                              disabled={rolesLoading}
                              className="rounded-2xl bg-orange-400 px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Demote to Member
                            </button>
                          )}

                          {isOwner && (
                            <span className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-semibold text-yellow-300">
                              Owner
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Account</h2>
              <p className="text-xs text-zinc-500">Manage your session</p>
            </div>

            <div className="mt-4 text-sm text-zinc-400">
              {currentUser ? (
                <p>
                  {currentUser.username} · {role}
                </p>
              ) : (
                <p>Account actions are available for logged-in users.</p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => (window.location.href = "/change-password")}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Change Password
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch("/api/auth/logout", { method: "POST" });
                  } catch {}

                  window.location.href = "/login";
                }}
                className="rounded-2xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Log Out
              </button>
            </div>

            <p className="mt-4 text-xs text-zinc-500">
              You will be signed out of this device only.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
