"use client";

import Navbar from "@/components/Navbar";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AdminRole = "member" | "officer" | "owner";

type AdminUser = {
  id: number;
  username: string;
  role: AdminRole;
};

type UnknownRecord = Record<string, unknown>;

type StatusData = {
  success?: boolean;
  loadedAt?: string;
  user?: AdminUser;
  overview?: UnknownRecord;
  bot?: UnknownRecord;
  cards?: AdminCard[];
  recentActivity?: ActivityItem[];
};

type AdminCard = {
  label: string;
  value: unknown;
  icon?: string;
};

type ActivityItem = {
  id?: string | number;
  level?: string;
  event?: string;
  message?: string;
  createdAt?: string | null;
};

type Player = {
  id?: string | number;
  avatar?: string | null;
  username?: string;
  discord?: string | null;
  discord_id?: string | null;
  robloxId?: string | null;
  roblox_id?: string | null;
  status?: string;
  currentWorld?: string;
  current_world?: string;
  lastSeen?: string | null;
  last_seen?: string | null;
  clanRank?: string | number | null;
  clan_rank?: string | number | null;
  points?: number;
};

type LinkRow = {
  discord_id?: string | number | null;
  discord?: string | number | null;
  roblox_id?: string | number | null;
  robloxId?: string | number | null;
  username?: string | null;
  main?: string | null;
  alts?: unknown;
};

type Giveaway = {
  id?: string | number;
  prize?: string;
  active?: boolean | number;
  entries?: number;
  end_time?: number;
  endsAt?: string | null;
  ends_at?: string | null;
  winners?: number;
  winnerCount?: number;
  winner_count?: number;
  linkedInviteEvent?: string | null;
  linked_invite_event?: string | null;
};

type InviteEvent = {
  id?: string | number;
  name?: string;
  status?: string;
  active?: boolean | number;
  start_time?: number;
  end_time?: number;
  start?: string | null;
  end?: string | null;
  invites?: number;
  reward?: string | null;
};

type AdminSection =
  | "overview"
  | "bot"
  | "invites"
  | "giveaways"
  | "players"
  | "links"
  | "war"
  | "logs"
  | "settings";

const SECTIONS: { id: AdminSection; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "bot", label: "Bot", icon: "🤖" },
  { id: "invites", label: "Invite Events", icon: "📨" },
  { id: "giveaways", label: "Giveaways", icon: "🎉" },
  { id: "players", label: "Players", icon: "👥" },
  { id: "links", label: "Roblox Links", icon: "🔗" },
  { id: "war", label: "War Tracker", icon: "⚔" },
  { id: "logs", label: "Logs", icon: "📜" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const QUICK_ACTIONS = [
  { label: "Sync War", endpoint: "/api/admin/sync", body: { target: "war" } },
  {
    label: "Force Presence Check",
    endpoint: "/api/admin/sync",
    body: { target: "presence" },
  },
  {
    label: "Refresh Profiles",
    endpoint: "/api/admin/sync",
    body: { target: "profiles" },
  },
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readString(record: UnknownRecord | undefined, keys: string[], fallback = "—") {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
  }
  return fallback;
}

function readNumber(record: UnknownRecord | undefined, keys: string[], fallback = 0) {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function toDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Active" : "None";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function formatUptime(value: unknown) {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function timestampToMs(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function formatTime(value: unknown) {
  const ms = timestampToMs(value);
  if (ms === null) return value === null || value === undefined || value === "" ? "—" : String(value);
  return new Date(ms).toLocaleString();
}

function formatRelativeTime(value: unknown, referenceValue?: unknown) {
  const ms = timestampToMs(value);
  const referenceMs = timestampToMs(referenceValue);

  if (ms === null) return "—";
  if (referenceMs === null) return formatTime(value);

  const seconds = Math.max(0, Math.floor((referenceMs - ms) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatTime(value);
}

function secondsUntil(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? (value < 10_000_000_000 ? value * 1000 : value) : Date.parse(String(value));
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((ms - Date.now()) / 1000));
}

function isActiveFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "active";
  }
  return false;
}

function hasRealTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") return false;

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  const raw = String(value).trim();
  if (!raw) return false;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric > 0;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0;
}

function isRealInviteEvent(event: InviteEvent | null): event is InviteEvent {
  if (!event) return false;

  return (
    isActiveFlag(event.active) ||
    hasRealTimestamp(event.start_time) ||
    hasRealTimestamp(event.end_time) ||
    hasRealTimestamp(event.start) ||
    hasRealTimestamp(event.end)
  );
}

function levelTone(level?: string) {
  const normalized = String(level ?? "info").toLowerCase();
  if (normalized.includes("error")) return "text-red-300 border-red-500/30 bg-red-500/10";
  if (normalized.includes("warn")) return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
}

function statusTone(status?: string) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized.includes("online") || normalized.includes("running") || normalized.includes("healthy") || normalized.includes("connected")) {
    return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  }
  if (normalized.includes("offline") || normalized.includes("error") || normalized.includes("disconnect")) {
    return "text-red-300 border-red-500/30 bg-red-500/10";
  }
  return "text-zinc-300 border-white/10 bg-white/5";
}

function safeId(prefix: string, value: unknown, index: number) {
  return `${prefix}-${String(value ?? index)}`;
}

export default function AdminPage() {
  const [section, setSection] = useState<AdminSection>("overview");
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [invites, setInvites] = useState<InviteEvent[]>([]);
  const [inviteLeaderboard, setInviteLeaderboard] = useState<UnknownRecord[]>([]);
  const [logs, setLogs] = useState<ActivityItem[]>([]);
  const [search, setSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState("");

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, playersRes, giveawaysRes, invitesRes, logsRes] = await Promise.all([
        fetch("/api/admin/status", { cache: "no-store" }),
        fetch("/api/admin/players", { cache: "no-store" }),
        fetch("/api/admin/giveaways", { cache: "no-store" }),
        fetch("/api/admin/invites", { cache: "no-store" }),
        fetch("/api/admin/logs", { cache: "no-store" }),
      ]);

      if (statusRes.ok) {
        const data = (await statusRes.json()) as StatusData;
        setStatus(data);
        if (data.user) setCurrentUser(data.user);
      }

      if (playersRes.ok) {
        const data = (await playersRes.json()) as UnknownRecord;
        setPlayers(asArray<Player>(data.players));
        setLinks(asArray<LinkRow>(data.links));
      }

      if (giveawaysRes.ok) {
        const data = (await giveawaysRes.json()) as UnknownRecord;
        const list = asArray<Giveaway>(data.giveaways);
        const active = isRecord(data.active) ? (data.active as Giveaway) : null;
        setGiveaways(active && !list.length ? [active] : list);
      }

      if (invitesRes.ok) {
        const data = (await invitesRes.json()) as UnknownRecord;
        const events = asArray<InviteEvent>(data.events).filter(isRealInviteEvent);
        const active = isRecord(data.active) ? (data.active as InviteEvent) : null;
        setInvites(isRealInviteEvent(active) && !events.length ? [active] : events);
        setInviteLeaderboard(asArray<UnknownRecord>(data.leaderboard));
      }

      if (logsRes.ok) {
        const data = (await logsRes.json()) as UnknownRecord;
        setLogs(asArray<ActivityItem>(data.logs));
      }
    } catch (err) {
      console.error("[admin] load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadAuth() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as UnknownRecord;
        const user = isRecord(data.user) ? (data.user as AdminUser) : null;
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthLoaded(true);
      }
    }

    loadAuth();
  }, []);

  useEffect(() => {
    if (!authLoaded) return;

    const timer = window.setTimeout(() => {
      if (currentUser?.role === "owner" || currentUser?.role === "officer") {
        void loadAdminData();
      } else {
        setLoading(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authLoaded, currentUser?.role, loadAdminData]);

  async function postAction(endpoint: string, body: UnknownRecord = {}) {
    setActionStatus("Running action...");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Action failed"));
      setActionStatus(String(data.message ?? "Action completed"));
      await loadAdminData();
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Action failed");
    } finally {
      window.setTimeout(() => setActionStatus(""), 3500);
    }
  }

  function createGiveaway() {
    const prize = window.prompt("Giveaway prize?");
    if (!prize) return;
    const winners = Number(window.prompt("Winner count?", "1") || "1");
    const invitesPerEntry = Number(window.prompt("Invites per entry?", "2") || "2");
    void postAction("/api/admin/giveaway/create", {
      prize,
      winners: Number.isFinite(winners) ? winners : 1,
      invites_per_entry: Number.isFinite(invitesPerEntry) ? invitesPerEntry : 2,
    });
  }

  function startInviteEvent() {
    const durationHours = Number(window.prompt("Invite event duration in hours?", "24") || "24");
    const reward = window.prompt("Reward text?", "Giveaway entries") || "Giveaway entries";
    void postAction("/api/admin/invite/start", {
      duration_hours: Number.isFinite(durationHours) ? durationHours : 24,
      reward,
    });
  }

  const canAdmin = currentUser?.role === "owner" || currentUser?.role === "officer";
  const isOwner = currentUser?.role === "owner";

  const overview = status?.overview;
  const bot = status?.bot;
  const cards = status?.cards?.length
    ? status.cards
    : [
        { label: "Bot Status", value: readString(overview, ["botStatus"]), icon: "🟢" },
        { label: "Uptime", value: formatUptime(overview?.uptimeSeconds), icon: "⏱" },
        { label: "Last Heartbeat", value: readString(overview, ["lastHeartbeat"]), icon: "❤️" },
        { label: "Database", value: readString(overview, ["databaseStatus"]), icon: "🗄" },
        { label: "Tracked Players", value: readNumber(overview, ["trackedPlayers"]), icon: "👥" },
        { label: "Active Giveaway", value: readString(overview, ["activeGiveaway"]), icon: "🎉" },
        { label: "Invite Event", value: readString(overview, ["activeInviteEvent"]), icon: "📨" },
        { label: "Current War", value: readString(overview, ["currentWar"]), icon: "⚔" },
      ];

  const recentActivity = useMemo(
    () => (logs.length ? logs : status?.recentActivity ?? []),
    [logs, status?.recentActivity]
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((player) => {
      const username = String(player.username ?? "").toLowerCase();
      const discord = String(player.discord ?? player.discord_id ?? "").toLowerCase();
      const roblox = String(player.robloxId ?? player.roblox_id ?? "").toLowerCase();
      return username.includes(q) || discord.includes(q) || roblox.includes(q);
    });
  }, [players, search]);

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return recentActivity;
    return recentActivity.filter((item) => String(item.level ?? "info").toLowerCase().includes(logFilter));
  }, [recentActivity, logFilter]);

  const linksByDiscord = useMemo(() => {
    const map = new Map<string, { discord: string; main: string; alts: string[] }>();

    for (const player of players) {
      const discord = String(player.discord ?? player.discord_id ?? "");
      if (!discord) continue;
      const current = map.get(discord) ?? { discord, main: "—", alts: [] };
      const name = String(player.username ?? player.robloxId ?? player.roblox_id ?? "—");
      if (current.main === "—") current.main = name;
      map.set(discord, current);
    }

    for (const link of links) {
      const discord = String(link.discord ?? link.discord_id ?? "");
      if (!discord) continue;
      const current = map.get(discord) ?? { discord, main: "—", alts: [] };
      const altName = String(link.username ?? link.robloxId ?? link.roblox_id ?? "Alt");
      current.alts.push(altName);
      map.set(discord, current);
    }

    return Array.from(map.values());
  }, [links, players]);

  if (!authLoaded || loading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen px-4 py-10 text-white">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300" />
            <p className="mt-4 text-sm text-zinc-400">Loading admin control panel...</p>
          </div>
        </main>
      </>
    );
  }

  if (!currentUser) {
    return (
      <AccessState
        title="Sign in required"
        message="The admin control panel is protected. Sign in with an officer or owner account to continue."
      >
        <Link className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-black" href="/login">
          Go to login
        </Link>
      </AccessState>
    );
  }

  if (!canAdmin) {
    return (
      <AccessState
        title="Admin access required"
        message="Your account is signed in, but this panel is limited to officers and owners."
      >
        <Link className="rounded-full border border-white/10 px-5 py-2 text-sm text-white" href="/">
          Back to Hub
        </Link>
      </AccessState>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen px-4 py-6 text-white sm:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
          <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:w-64 lg:shrink-0">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
              <div className="px-3 py-4">
                <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">Admin</div>
                <h1 className="mt-1 text-2xl font-bold">Control Panel</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Signed in as {currentUser.username} · {currentUser.role}
                </p>
              </div>
              <nav className="grid gap-1">
                {SECTIONS.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition hover:bg-white/10"
                      style={{
                        background: active ? "rgba(255,255,255,0.10)" : "transparent",
                        border: `1px solid ${active ? "var(--border)" : "transparent"}`,
                      }}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <section className="min-w-0 flex-1 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">MCWV Hub</div>
                  <h2 className="mt-1 text-3xl font-bold sm:text-4xl">
                    {SECTIONS.find((item) => item.id === section)?.icon} {SECTIONS.find((item) => item.id === section)?.label}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                    Monitor the Discord bot, manage invite events and giveaways, track Roblox players,
                    and keep war operations in one protected place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="admin-button" type="button" onClick={loadAdminData}>
                    Refresh
                  </button>
                  {isOwner && (
                    <button
                      className="admin-button-danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm("Restart the bot process? Only use this if your host auto-restarts it.")) {
                          void postAction("/api/admin/restart", { confirm: true });
                        }
                      }}
                    >
                      Restart Bot
                    </button>
                  )}
                </div>
              </div>
              {actionStatus && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
                  {actionStatus}
                </div>
              )}
            </div>

            {section === "overview" && (
              <OverviewSection
                cards={cards}
                loadedAt={status?.loadedAt}
                recentActivity={recentActivity}
                onAction={postAction}
              />
            )}

            {section === "bot" && <BotSection bot={bot} />}

            {section === "invites" && (
              <InvitesSection
                invites={invites}
                leaderboard={inviteLeaderboard}
                onStart={startInviteEvent}
                onAction={postAction}
              />
            )}

            {section === "giveaways" && (
              <GiveawaysSection
                giveaways={giveaways}
                onCreate={createGiveaway}
                onAction={postAction}
              />
            )}

            {section === "players" && (
              <PlayersSection
                players={filteredPlayers}
                search={search}
                setSearch={setSearch}
                onAction={postAction}
              />
            )}

            {section === "links" && <LinksSection rows={linksByDiscord} onAction={postAction} />}

            {section === "war" && <WarSection overview={overview} />}

            {section === "logs" && (
              <LogsSection
                logs={filteredLogs}
                filter={logFilter}
                setFilter={setLogFilter}
              />
            )}

            {section === "settings" && <SettingsSection bot={bot} isOwner={isOwner} />}
          </section>
        </div>
      </main>

      <style jsx global>{`
        .admin-button {
          border: 1px solid var(--border);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          padding: 0.55rem 0.9rem;
          color: white;
          font-size: 0.85rem;
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .admin-button:hover {
          background: rgba(255, 255, 255, 0.13);
          transform: translateY(-1px);
        }
        .admin-button-danger {
          border: 1px solid rgba(248, 113, 113, 0.35);
          border-radius: 999px;
          background: rgba(248, 113, 113, 0.12);
          padding: 0.55rem 0.9rem;
          color: rgb(252, 165, 165);
          font-size: 0.85rem;
        }
      `}</style>
    </>
  );
}

function AccessState({ title, message, children }: { title: string; message: string; children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen px-4 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl">🔐</div>
          <h1 className="mt-5 text-3xl font-bold">{title}</h1>
          <p className="mt-3 text-zinc-400">{message}</p>
          <div className="mt-6 flex justify-center">{children}</div>
        </div>
      </main>
    </>
  );
}

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function OverviewSection({
  cards,
  loadedAt,
  recentActivity,
  onAction,
}: {
  cards: AdminCard[];
  loadedAt?: string;
  recentActivity: ActivityItem[];
  onAction: (endpoint: string, body?: UnknownRecord) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const label = card.label.toLowerCase();
          const isHeartbeat = label.includes("heartbeat");
          const value = label.includes("uptime")
            ? formatUptime(card.value)
            : isHeartbeat
            ? formatRelativeTime(card.value, loadedAt)
            : toDisplayValue(card.value);

          return (
            <div
              key={safeId("card", card.label, index)}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white/10"
              title={isHeartbeat ? formatTime(card.value) : undefined}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{card.label}</div>
                <div className="text-2xl">{card.icon ?? "•"}</div>
              </div>
              <div className="mt-4 break-words text-2xl font-bold tabular-nums">
                {value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent Activity">
          <ActivityList items={recentActivity} />
        </Panel>
        <Panel title="Quick Actions">
          <div className="grid gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:bg-white/10"
                onClick={() => void onAction(action.endpoint, action.body)}
              >
                <span>{action.label}</span>
                <span className="text-zinc-500">→</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BotSection({ bot }: { bot: UnknownRecord | undefined }) {
  const loops = isRecord(bot?.loops) ? bot?.loops : {};
  const loopRows = Object.entries(loops).length
    ? Object.entries(loops)
    : [
        ["War Poll Loop", "Unknown"],
        ["Presence Loop", "Unknown"],
        ["Reminder Loop", "Unknown"],
        ["Invite Cache", "Unknown"],
        ["Database", readString(bot, ["database", "status"], "Unknown")],
      ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="CPU Usage" value={readString(bot, ["cpu"], "—")} suffix="%" />
        <Metric label="RAM Usage" value={readString(bot, ["ramMb"], "—")} suffix="MB" />
        <Metric label="Ping" value={readString(bot, ["pingMs"], "—")} suffix="ms" />
        <Metric label="Guild Count" value={readString(bot, ["guildCount"], "—")} />
        <Metric label="Users" value={readString(bot, ["users"], "—")} />
        <Metric label="Commands Executed" value={readString(bot, ["commandsExecuted"], "—")} />
      </div>
      <Panel title="Background Loops">
        <div className="grid gap-3 sm:grid-cols-2">
          {loopRows.map(([name, value], index) => {
            const text = isRecord(value) ? readString(value, ["status", "state"], "Unknown") : String(value ?? "Unknown");
            return (
              <div key={safeId("loop", name, index)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span>{name}</span>
                <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(text)}`}>{text}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function InvitesSection({
  invites,
  leaderboard,
  onStart,
  onAction,
}: {
  invites: InviteEvent[];
  leaderboard: UnknownRecord[];
  onStart: () => void;
  onAction: (endpoint: string, body?: UnknownRecord) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <Panel
        title="Invite Events"
        right={<button className="admin-button" type="button" onClick={onStart}>Create</button>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              <tr>
                <th className="pb-3">Name</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Start</th>
                <th className="pb-3">End</th>
                <th className="pb-3">Invites</th>
                <th className="pb-3">Reward</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {invites.length ? invites.map((event, index) => {
                const status = event.status ?? (event.active ? "Active" : "Ended");
                return (
                  <tr key={safeId("invite", event.id, index)}>
                    <td className="py-4 font-medium">{event.name ?? `Invite Event ${event.id ?? index + 1}`}</td>
                    <td className="py-4"><span className={`rounded-full border px-3 py-1 text-xs ${statusTone(status)}`}>{status}</span></td>
                    <td className="py-4 text-zinc-400">{formatTime(event.start ?? event.start_time)}</td>
                    <td className="py-4 text-zinc-400">{formatTime(event.end ?? event.end_time)}</td>
                    <td className="py-4">{toDisplayValue(event.invites ?? 0)}</td>
                    <td className="py-4 text-zinc-400">{event.reward ?? "—"}</td>
                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/invite/end", { id: event.id })}>End</button>
                        <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/invite/pause", { id: event.id })}>Pause</button>
                        <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/invite/resume", { id: event.id })}>Resume</button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-zinc-500">
                    <div className="font-medium text-zinc-300">No invite event running.</div>
                    <div className="mt-1 text-sm">Create one to start tracking invite joins.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Invite Leaderboard">
        <div className="grid gap-3">
          {leaderboard.length ? leaderboard.slice(0, 10).map((row, index) => (
            <div key={safeId("invite-leader", row.user_id ?? row.discord_id, index)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <span>{index + 1}. {readString(row, ["name", "username", "user", "user_id", "discord_id"])}</span>
              <span className="font-semibold">{readString(row, ["invites", "count"], "0")} invites</span>
            </div>
          )) : <p className="text-sm text-zinc-500">Leaderboard appears here once the bot reports invite counts.</p>}
        </div>
      </Panel>
    </div>
  );
}

function GiveawaysSection({
  giveaways,
  onCreate,
  onAction,
}: {
  giveaways: Giveaway[];
  onCreate: () => void;
  onAction: (endpoint: string, body?: UnknownRecord) => Promise<void>;
}) {
  return (
    <Panel
      title="Giveaways"
      right={<button className="admin-button" type="button" onClick={onCreate}>Create</button>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {giveaways.length ? giveaways.map((giveaway, index) => {
          const ends = giveaway.endsAt ?? giveaway.ends_at ?? giveaway.end_time;
          return (
            <div key={safeId("giveaway", giveaway.id, index)} className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Prize</div>
                  <h4 className="mt-2 text-xl font-bold">{giveaway.prize ?? "Unknown prize"}</h4>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(giveaway.active ? "Active" : "Ended")}`}>
                  {giveaway.active ? "Active" : "Ended"}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <MiniStat label="Entries" value={toDisplayValue(giveaway.entries ?? 0)} />
                <MiniStat label="Ends In" value={formatUptime(secondsUntil(ends))} />
                <MiniStat label="Winner Count" value={toDisplayValue(giveaway.winnerCount ?? giveaway.winner_count ?? giveaway.winners ?? 1)} />
                <MiniStat label="Invite Event" value={giveaway.linkedInviteEvent ?? giveaway.linked_invite_event ?? "Linked"} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/giveaway/end", { id: giveaway.id })}>End</button>
                <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/giveaway/reroll", { id: giveaway.id })}>Reroll</button>
                <button className="admin-button-danger" type="button" onClick={() => void onAction("/api/admin/giveaway/cancel", { id: giveaway.id })}>Cancel</button>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-zinc-500 md:col-span-2 xl:col-span-3">
            No giveaways loaded. Connect the bot admin API or create a new giveaway.
          </div>
        )}
      </div>
    </Panel>
  );
}

function PlayersSection({
  players,
  search,
  setSearch,
  onAction,
}: {
  players: Player[];
  search: string;
  setSearch: (value: string) => void;
  onAction: (endpoint: string, body?: UnknownRecord) => Promise<void>;
}) {
  return (
    <Panel
      title="Tracked Players"
      right={
        <input
          className="w-full rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none placeholder:text-zinc-600 sm:w-72"
          placeholder="Search players..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="pb-3">Avatar</th>
              <th className="pb-3">Username</th>
              <th className="pb-3">Discord</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Current World</th>
              <th className="pb-3">Last Seen</th>
              <th className="pb-3">Clan Rank</th>
              <th className="pb-3">Points</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {players.length ? players.map((player, index) => {
              const id = player.robloxId ?? player.roblox_id ?? player.id;
              const status = player.status ?? "Unknown";
              return (
                <tr key={safeId("player", id, index)}>
                  <td className="py-4">
                    {player.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatar} alt="" className="h-10 w-10 rounded-full border border-white/10" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">👤</div>
                    )}
                  </td>
                  <td className="py-4 font-medium">{player.username ?? "Unknown"}</td>
                  <td className="py-4 text-zinc-400">{player.discord ?? player.discord_id ?? "—"}</td>
                  <td className="py-4"><span className={`rounded-full border px-3 py-1 text-xs ${statusTone(status)}`}>{status}</span></td>
                  <td className="py-4 text-zinc-400">{player.currentWorld ?? player.current_world ?? "—"}</td>
                  <td className="py-4 text-zinc-400">{formatTime(player.lastSeen ?? player.last_seen)}</td>
                  <td className="py-4">{player.clanRank ?? player.clan_rank ?? "—"}</td>
                  <td className="py-4">{toDisplayValue(player.points ?? 0)}</td>
                  <td className="py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link className="admin-button" href={`/profile/${encodeURIComponent(String(player.username ?? id ?? ""))}`}>Profile</Link>
                      <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/player/sync", { roblox_id: id })}>Sync</button>
                      <button className="admin-button-danger" type="button" onClick={() => void onAction("/api/admin/player/remove", { roblox_id: id })}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={9} className="py-8 text-center text-zinc-500">No tracked players found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function LinksSection({
  rows,
  onAction,
}: {
  rows: { discord: string; main: string; alts: string[] }[];
  onAction: (endpoint: string, body?: UnknownRecord) => Promise<void>;
}) {
  return (
    <Panel title="Roblox Links">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="pb-3">Discord User</th>
              <th className="pb-3">Main Roblox</th>
              <th className="pb-3">Alt 1</th>
              <th className="pb-3">Alt 2</th>
              <th className="pb-3">Alt 3</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.length ? rows.map((row, index) => (
              <tr key={safeId("link", row.discord, index)}>
                <td className="py-4 font-medium">{row.discord}</td>
                <td className="py-4">{row.main}</td>
                <td className="py-4 text-zinc-400">{row.alts[0] ?? "—"}</td>
                <td className="py-4 text-zinc-400">{row.alts[1] ?? "—"}</td>
                <td className="py-4 text-zinc-400">{row.alts[2] ?? "—"}</td>
                <td className="py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/player/sync", { discord_id: row.discord })}>Edit</button>
                    <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/player/sync", { discord_id: row.discord, add_alt: true })}>Add Alt</button>
                    <button className="admin-button-danger" type="button" onClick={() => void onAction("/api/admin/player/remove", { discord_id: row.discord })}>Unlink</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="py-8 text-center text-zinc-500">No Roblox links found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function WarSection({ overview }: { overview: UnknownRecord | undefined }) {
  const progress = Math.max(0, Math.min(100, readNumber(overview, ["progressPct", "progress", "warProgress"], 0)));
  const currentWar = readString(overview, ["currentWar"], "Current battle unknown");

  return (
    <div className="space-y-6">
      <Panel title="Current Battle">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Battle</div>
            <h3 className="mt-2 text-3xl font-bold">{currentWar}</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MiniStat label="Timer" value={readString(overview, ["timer", "endsIn"], "—")} />
              <MiniStat label="Clan Points" value={readString(overview, ["clanPoints", "totalPoints"], "—")} />
              <MiniStat label="Tracked Players" value={readString(overview, ["trackedPlayers"], "—")} />
            </div>
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs text-zinc-500">
                <span>Live graph</span>
                <span>{progress.toFixed(1)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-emerald-400"
                  style={{ width: `${progress}%`, boxShadow: "0 0 20px var(--glow)" }}
                />
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Recent Changes</div>
            <div className="mt-4 space-y-3 text-sm text-zinc-400">
              <p>Leaderboard, contribution graph, and battle history are ready to bind to the bot war API.</p>
              <p>Use the Overview quick action to force a war sync.</p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function LogsSection({
  logs,
  filter,
  setFilter,
}: {
  logs: ActivityItem[];
  filter: string;
  setFilter: (filter: string) => void;
}) {
  const filters = ["all", "error", "warning", "info"];
  return (
    <Panel
      title="Logs"
      right={
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs capitalize ${filter === item ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-zinc-400"}`}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      }
    >
      <ActivityList items={logs} />
    </Panel>
  );
}

function SettingsSection({ bot, isOwner }: { bot: UnknownRecord | undefined; isOwner: boolean }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Bot Runtime Settings">
        <div className="grid gap-3">
          <MiniStat label="Reminder Interval" value={readString(bot, ["reminderInterval", "reminder_interval"], "30m")} />
          <MiniStat label="Reminder Channel" value={readString(bot, ["reminderChannel", "reminder_channel_id"], "—")} />
          <MiniStat label="War Poll Interval" value="20m" />
          <MiniStat label="Profile Cache" value="60s" />
          <MiniStat label="Presence Delay" value="2m" />
        </div>
      </Panel>
      <Panel title="Secrets & Webhooks">
        <div className="space-y-3 text-sm text-zinc-400">
          <p>API keys, Discord webhooks, and bot token values stay server-side. This panel only shows connection health.</p>
          <MiniStat label="Bot Token Status" value={readString(bot, ["connected"], "Hidden")} />
          <MiniStat label="Admin API" value={readString(bot, ["configured"], "Not configured")} />
          {!isOwner && <p className="text-amber-300">Only owners can restart or remove players.</p>}
        </div>
      </Panel>
    </div>
  );
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-3 text-3xl font-bold">
        {value}{value !== "—" && suffix ? <span className="ml-1 text-base text-zinc-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 font-semibold text-white">{toDisplayValue(value)}</div>
    </div>
  );
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-zinc-500">No log entries yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 12).map((item, index) => {
        const level = item.level ?? "info";
        return (
          <div key={safeId("activity", item.id, index)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className={`w-fit rounded-full border px-3 py-1 text-xs capitalize ${levelTone(level)}`}>{level}</span>
              <span className="text-xs text-zinc-500">{formatTime(item.createdAt)}</span>
            </div>
            <div className="mt-3 font-medium">{item.event ?? item.message ?? "Activity"}</div>
            {item.event && item.message ? <div className="mt-1 text-sm text-zinc-400">{item.message}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
