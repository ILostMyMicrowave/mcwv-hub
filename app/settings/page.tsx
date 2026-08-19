"use client";

import Navbar from "@/components/Navbar";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import PwaInstallCard from "@/components/pwa/PwaInstallCard";
import PushCard from "@/components/pwa/PushCard";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  has_account?: boolean;
  hasAccount?: boolean;
};

type AdminUsersResponse = {
  users: AppUser[];
};

type AuthMeResponse =
  | { user?: AppUser | null; role?: AppUser["role"] | null }
  | AppUser
  | null;

const INTRO_SESSION_KEY = "mcwv_intro_seen_v1";

const fieldClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:bg-black/50";

function Section({
  icon,
  eyebrow,
  title,
  status,
  delay = 0,
  children,
}: {
  icon: string;
  eyebrow: string;
  title: string;
  status?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <section
      className="st-rise rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-lg">
            {icon}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">{eyebrow}</p>
            <h2 className="text-xl font-bold text-white">{title}</h2>
          </div>
        </div>
        {status ? <p className="shrink-0 text-xs font-semibold text-emerald-300">{status}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FieldBlock({
  label,
  hint,
  onSave,
  saving,
  disabled,
  saveLabel,
  children,
}: {
  label: string;
  hint?: string;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
  saveLabel: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-zinc-200">{label}</label>
      {children}
      {hint && <p className="mt-2 text-xs text-zinc-500">{hint}</p>}
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="mt-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}

function ActionRow({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-zinc-400">{desc}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

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
  const [passwordOpen, setPasswordOpen] = useState(false);

  const themes: {
    id: Theme;
    name: string;
    desc: string;
    color: string;
  }[] = [
    { id: "default", name: "Default", desc: "Classic dark MCWV theme", color: "bg-emerald-400" },
    { id: "ice", name: "Ice", desc: "Blue frost battlefield theme", color: "bg-sky-400" },
    { id: "inferno", name: "Inferno", desc: "Fire & war intensity theme", color: "bg-red-500" },
  ];

  const canEditGlobal = role === "officer" || role === "owner";
  const canManageRoles = role === "owner";

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
      setStatus("Saved ✓");
    } catch {
      setStatus("Save failed");
    } finally {
      setSaving(null);
      window.setTimeout(() => setStatus(""), 1500);
    }
  }

  async function restartTutorial() {
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });

      if (!res.ok) throw new Error("restart failed");
      window.location.href = "/";
    } catch {
      setStatus("Could not restart tutorial");
      window.setTimeout(() => setStatus(""), 1800);
    }
  }

  function replayIntro() {
    try {
      // Both stores must go — the gate checks localStorage first (v2)
      // and promotes legacy sessionStorage on read.
      localStorage.removeItem(INTRO_SESSION_KEY);
      sessionStorage.removeItem(INTRO_SESSION_KEY);
      document.documentElement.removeAttribute("data-intro-done");
    } catch {
      // Storage blocked — the intro gate will simply behave normally.
    }
    window.location.href = "/";
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
      setRolesStatus("Role updated ✓");
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

  async function deleteWebsiteAccount(userId: number, username: string) {
    if (!canManageRoles) {
      setRolesStatus("You do not have permission to delete website accounts");
      return;
    }

    if (!window.confirm(`Delete ${username}'s website login? Their Roblox/Discord bot links will stay saved.`)) {
      return;
    }

    setRolesLoading(true);
    setRolesStatus("");
    try {
      const res = await fetch("/api/admin/users/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "delete failed");

      setRolesStatus(data?.message ?? "Website account deleted");
      const refreshed = await fetch("/api/admin/users", { cache: "no-store" });
      if (refreshed.ok) {
        const refreshedData: AdminUsersResponse = await refreshed.json();
        setMembers(Array.isArray(refreshedData.users) ? refreshedData.users : []);
      }
    } catch (err) {
      setRolesStatus(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setRolesLoading(false);
      window.setTimeout(() => setRolesStatus(""), 2200);
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

  const roleBadge =
    role === "owner"
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
      : role === "officer"
      ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
      : "border-white/10 bg-white/5 text-zinc-300";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="st-rise mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/80">Control Panel</p>
            <h1 className="mt-2 text-4xl font-black text-white sm:text-5xl">Settings</h1>
            <p className="mt-2 text-zinc-400">
              Manage display options, clan preferences, and system configuration.
            </p>
            {currentUser && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                Logged in as <span className="font-semibold text-zinc-300">{currentUser.username}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${roleBadge}`}>
                  {role}
                </span>
              </p>
            )}
          </div>

          {/* Theme */}
          <Section icon="🎨" eyebrow="Appearance" title="Theme" status={theme ? `Active: ${theme}` : undefined} delay={0.05}>
            <div className="grid gap-4 sm:grid-cols-3">
              {themes.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`
                      shine-sweep glow-spin rounded-2xl border p-5 text-left transition-all duration-300
                      hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98]
                      ${active
                        ? "border-white/40 bg-white/10 shadow-lg scale-[1.03]"
                        : "border-white/10 bg-white/5 hover:bg-white/10"}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${t.color} ${active ? "ring-2 ring-white/60" : ""}`} />
                      <p className="font-semibold">{t.name}</p>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">{t.desc}</p>
                    {active && <p className="mt-3 text-xs font-semibold text-emerald-300">Active ✓</p>}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Experience */}
          <div className="mt-6">
            <Section icon="⚡" eyebrow="Onboarding & Intro" title="Experience" status={!canEditGlobal ? status : undefined} delay={0.1}>
              <div className="space-y-3">
                <ActionRow
                  title="Boot intro"
                  desc="Re-watch the MCWV boot sequence — the logo reveal, reactor rings and all. You'll land back home when it ends."
                  action={
                    <button
                      type="button"
                      onClick={replayIntro}
                      className="rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:opacity-90"
                    >
                      ⚡ Replay Intro
                    </button>
                  }
                />
                <ActionRow
                  title="Website tutorial"
                  desc="Want a quick refresher? Restart the guided tour whenever you like."
                  action={
                    <button
                      type="button"
                      onClick={() => void restartTutorial()}
                      className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-400/15"
                    >
                      Restart Tutorial
                    </button>
                  }
                />
              </div>
            </Section>
          </div>

          {/* App & Alerts (installed PWA) */}
          <div id="install" className="mt-6 scroll-mt-24">
            <Section icon="📲" eyebrow="Installed App" title="App & Alerts" delay={0.12}>
              <div className="space-y-3">
                <PwaInstallCard />
                <PushCard />
                <a
                  href="/notifications"
                  className="block rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.06]"
                >
                  <p className="text-sm font-bold text-white">📬 Alert inbox</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Every alert with unread markers — war pings, broadcasts,
                    and personal nudges in one place.
                  </p>
                </a>
              </div>
            </Section>
          </div>

          {/* Account */}
          <div className="mt-6">
            <Section icon="🔐" eyebrow="Security" title="Account" delay={0.14}>
              <div className="text-sm text-zinc-400">
                {currentUser ? (
                  <p>
                    Signed in as <span className="font-semibold text-zinc-200">{currentUser.username}</span>
                  </p>
                ) : (
                  <p>Account actions are available for logged-in users.</p>
                )}
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
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
                  className="rounded-2xl border border-red-400/30 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-200 transition hover:-translate-y-0.5 hover:bg-red-500/25"
                >
                  Log Out
                </button>
              </div>
              <p className="mt-4 text-xs text-zinc-500">You will be signed out of this device only.</p>
            </Section>
          </div>

          {/* Global settings (officer+) */}
          {canEditGlobal ? (
            <div className="mt-6">
              <Section icon="🛰️" eyebrow="Officer Controls" title="Global Settings" status={status} delay={0.18}>
                <div className="space-y-8">
                  <FieldBlock
                    label="Scrolling banner text"
                    onSave={() => saveField("banner_text")}
                    saving={saving === "banner_text"}
                    disabled={!loaded || saving !== null}
                    saveLabel="Save Banner"
                  >
                    <textarea
                      value={bannerText}
                      onChange={(e) => setBannerText(e.target.value)}
                      rows={3}
                      className={fieldClass}
                      placeholder="Recruiting now!!"
                    />
                  </FieldBlock>

                  <FieldBlock
                    label={`Banner speed (${bannerSpeed}s)`}
                    onSave={() => saveField("banner_speed")}
                    saving={saving === "banner_speed"}
                    disabled={!loaded || saving !== null}
                    saveLabel="Save Speed"
                  >
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
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-300"
                        style={{ width: `${speedPercent}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                      <span>Fast</span>
                      <span>{bannerSpeed}s</span>
                      <span>Slow</span>
                    </div>
                  </FieldBlock>

                  <FieldBlock
                    label="Discord invite link"
                    onSave={() => saveField("discord_link")}
                    saving={saving === "discord_link"}
                    disabled={!loaded || saving !== null}
                    saveLabel="Save Discord"
                  >
                    <input
                      type="url"
                      value={discordLink}
                      onChange={(e) => setDiscordLink(e.target.value)}
                      className={fieldClass}
                      placeholder="https://discord.gg/yourinvite"
                    />
                  </FieldBlock>

                  <FieldBlock
                    label="Requirements text"
                    hint="Supports headings, subheadings, bold, italics, underline, and line breaks."
                    onSave={() => saveField("requirements_text")}
                    saving={saving === "requirements_text"}
                    disabled={!loaded || saving !== null}
                    saveLabel="Save Requirements"
                  >
                    <textarea
                      value={requirementsText}
                      onChange={(e) => setRequirementsText(e.target.value)}
                      rows={10}
                      className={fieldClass}
                      placeholder={`# Heading\nSubheading\nbold\nitalic\nunderline`}
                    />
                  </FieldBlock>
                </div>
              </Section>
            </div>
          ) : null}

          {/* Officer management (owner) */}
          {canManageRoles ? (
            <div className="mt-6">
              <Section icon="👥" eyebrow="Owner Only" title="Officer Management" status={rolesStatus} delay={0.22}>
                <p className="-mt-2 mb-4 text-sm text-zinc-400">
                  Promote or demote members. Only the owner can see this section.
                </p>
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className={fieldClass}
                  placeholder="Search by username, Discord ID, or role"
                />
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
                            <p className="font-semibold text-white">{member.username}</p>
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
                                className="rounded-2xl bg-sky-400 px-4 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                              >
                                Promote to Officer
                              </button>
                            )}
                            {isOfficer && (
                              <button
                                type="button"
                                onClick={() => updateRole(member.id, "member")}
                                disabled={rolesLoading}
                                className="rounded-2xl bg-orange-400 px-4 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                              >
                                Demote to Member
                              </button>
                            )}
                            {!isOwner && (member.has_account ?? member.hasAccount) && (
                              <button
                                type="button"
                                onClick={() => deleteWebsiteAccount(member.id, member.username)}
                                disabled={rolesLoading}
                                className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:-translate-y-0.5 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                title="Deletes only their website login. Roblox/Discord links stay saved."
                              >
                                Delete Website Account
                              </button>
                            )}
                            {!isOwner && !(member.has_account ?? member.hasAccount) && (
                              <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-400">
                                No Website Login
                              </span>
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
              </Section>
            </div>
          ) : null}
        </div>
      </main>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      <style jsx>{`
        .st-rise {
          animation: st-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes st-rise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
