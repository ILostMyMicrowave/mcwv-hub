"use client";

import Navbar from "@/components/Navbar";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  permissions?: {
    broadcast?: boolean;
  };
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
  action?: string | null;
  actorUsername?: string | null;
  actorUserId?: number | string | null;
  metadata?: UnknownRecord;
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

type AdminChannel = {
  id: string;
  name: string;
  label?: string;
  guildName?: string;
  parentName?: string | null;
  canSendMessages?: boolean;
  canCreateInvite?: boolean;
  usableForGiveaways?: boolean;
  usableForInvites?: boolean;
};

type AdminRoleOption = {
  id: string;
  name: string;
  guildName?: string;
  memberCount?: number;
};

type BroadcastRecipient = {
  username?: string;
  discord_id?: string | number;
  points?: number;
  rank?: number | null;
};

type BroadcastPreview = {
  recipientCount: number;
  deliverableCount: number;
  missingTicketCount: number;
  sampleRecipients: BroadcastRecipient[];
  missingTicketRecipients: BroadcastRecipient[];
};

function renderBroadcastPreviewMessage(template: string, recipient?: BroadcastRecipient) {
  return template
    .replaceAll("{username}", String(recipient?.username ?? "ExampleUser"))
    .replaceAll("{points}", String(recipient?.points ?? 0))
    .replaceAll("{rank}", String(recipient?.rank ?? "—"));
}

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
} | null;

type AdminAction = (endpoint: string, body?: UnknownRecord) => Promise<boolean>;

type AdminSection =
  | "overview"
  | "bot"
  | "broadcast"
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
  { id: "broadcast", label: "Broadcast", icon: "📢" },
  { id: "invites", label: "Invite Events", icon: "📨" },
  { id: "giveaways", label: "Giveaways", icon: "🎉" },
  { id: "players", label: "Players", icon: "👥" },
  { id: "links", label: "Roblox Links", icon: "🔗" },
  { id: "war", label: "War Tracker", icon: "⚔" },
  { id: "logs", label: "Logs", icon: "📜" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const SECTION_DESCRIPTIONS: Record<AdminSection, string> = {
  overview:
    "A quick operational summary of bot health, database status, tracked players, events, and recent admin activity.",
  bot:
    "Live runtime health, Discord latency, process usage, queue status, and background loop monitoring.",
  broadcast:
    "Send themed staff broadcasts to filtered clan audiences through DMs or saved ticket channels.",
  invites:
    "Create, pause, resume, and review invite competitions, leaderboards, invited members, and removed fake invites.",
  giveaways:
    "Manage Discord-style giveaways, entries, winner counts, rerolls, and invite-event-linked rewards.",
  players:
    "Review tracked Roblox accounts, Discord links, presence state, profile sync status, and removal actions.",
  links:
    "Audit and manage Discord-to-Roblox links, main accounts, alternate accounts, and unlink actions.",
  war:
    "Track current battle status, clan points, progress, contribution changes, and war sync actions.",
  logs:
    "Search recent admin, bot, API, database, presence, giveaway, invite, and runtime events.",
  settings:
    "Check runtime configuration, connection health, safe token status, intervals, channels, and admin API state.",
};

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

function firstArray(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];

  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }

  if (isRecord(value.data)) {
    for (const key of keys) {
      const candidate = value.data[key];
      if (Array.isArray(candidate)) return candidate;
    }
  }

  return [];
}

function pickRecordValue(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function valueToString(value: unknown, fallback: string | null = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function pickRecordString(record: UnknownRecord, keys: string[], fallback: string | null = "—") {
  return valueToString(pickRecordValue(record, keys), fallback);
}

function pickRecordNumber(record: UnknownRecord, keys: string[], fallback = 0) {
  const value = pickRecordValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizePresence(value: unknown) {
  if (typeof value === "number") {
    if (value === 0) return "Offline";
    if (value === 1) return "Online";
    if (value === 2) return "In Game";
    if (value === 3) return "In Studio";
  }

  if (typeof value === "string" && value.trim()) return value;
  return "Unknown";
}

function normalizePlayerRow(value: unknown): Player | null {
  if (Array.isArray(value)) {
    const robloxId = value[0];
    const discord = value[1];
    const username = value[2];

    return {
      id: valueToString(robloxId, undefined) ?? undefined,
      robloxId: valueToString(robloxId, null),
      discord: valueToString(discord, null),
      username: valueToString(username, "Unknown") ?? "Unknown",
      status: "Unknown",
      currentWorld: "—",
      lastSeen: null,
      clanRank: "—",
      points: 0,
      avatar: null,
    };
  }

  if (!isRecord(value)) return null;

  const robloxId = pickRecordValue(value, [
    "robloxId",
    "roblox_id",
    "robloxID",
    "RobloxID",
    "UserID",
    "userId",
    "user_id",
    "targetId",
    "id",
  ]);
  const username = pickRecordString(value, [
    "username",
    "name",
    "Name",
    "robloxUsername",
    "roblox_username",
    "robloxName",
    "roblox_name",
    "displayName",
    "DisplayName",
    "player",
    "user",
  ], valueToString(robloxId, "Unknown"));
  const discord = pickRecordValue(value, [
    "discord",
    "discord_id",
    "discordId",
    "DiscordID",
    "discordUser",
    "discord_user",
    "memberId",
    "member_id",
  ]);

  return {
    ...value,
    id: valueToString(pickRecordValue(value, ["id"]), valueToString(robloxId, username ?? undefined) ?? undefined) ?? undefined,
    robloxId: valueToString(robloxId, null),
    roblox_id: valueToString(robloxId, null),
    username: username ?? "Unknown",
    discord: valueToString(discord, null),
    discord_id: valueToString(discord, null),
    status: normalizePresence(
      pickRecordValue(value, [
        "status",
        "presence",
        "presenceStatus",
        "presence_status",
        "userPresenceType",
        "presence_type",
        "robloxStatus",
      ])
    ),
    currentWorld: pickRecordString(value, ["currentWorld", "current_world", "world", "place", "location", "game"], "—") ?? "—",
    current_world: pickRecordString(value, ["currentWorld", "current_world", "world", "place", "location", "game"], "—") ?? "—",
    lastSeen: valueToString(pickRecordValue(value, ["lastSeen", "last_seen", "lastOnline", "last_online", "updatedAt", "updated_at"]), null),
    last_seen: valueToString(pickRecordValue(value, ["lastSeen", "last_seen", "lastOnline", "last_online", "updatedAt", "updated_at"]), null),
    clanRank: pickRecordString(value, ["clanRank", "clan_rank", "clanRole", "clan_role", "rank"], "—"),
    clan_rank: pickRecordString(value, ["clanRank", "clan_rank", "clanRole", "clan_role", "rank"], "—"),
    points: pickRecordNumber(value, ["points", "Points", "battlePoints", "battle_points", "totalPoints", "total_points"], 0),
    avatar: pickRecordString(value, ["avatar", "avatarUrl", "avatar_url", "imageUrl", "image_url", "thumbnail", "thumbnailUrl"], null),
  };
}

function normalizeLinkRow(value: unknown): LinkRow | null {
  if (Array.isArray(value)) {
    const discord = value[0];
    const robloxId = value[1];
    const username = value[2];

    return {
      discord_id: valueToString(discord, null),
      roblox_id: valueToString(robloxId, null),
      username: valueToString(username, null),
    };
  }

  if (!isRecord(value)) return null;

  const discord = pickRecordValue(value, ["discord", "discord_id", "discordId", "DiscordID"]);
  const robloxId = pickRecordValue(value, ["robloxId", "roblox_id", "robloxID", "RobloxID", "UserID", "user_id"]);
  const username = pickRecordString(value, ["username", "name", "robloxUsername", "roblox_username", "robloxName", "roblox_name"], null);

  return {
    ...value,
    discord_id: valueToString(discord, null),
    roblox_id: valueToString(robloxId, null),
    username,
  };
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

function hasRealGiveawayPrize(prize: unknown) {
  if (typeof prize !== "string") return false;

  const normalized = prize.trim().toLowerCase();
  return Boolean(normalized && normalized !== "unknown prize");
}

function isRealGiveaway(giveaway: Giveaway | null): giveaway is Giveaway {
  if (!giveaway) return false;

  return (
    isActiveFlag(giveaway.active) ||
    hasRealGiveawayPrize(giveaway.prize) ||
    hasRealTimestamp(giveaway.end_time) ||
    hasRealTimestamp(giveaway.endsAt) ||
    hasRealTimestamp(giveaway.ends_at)
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

function confirmTypedAction(action: string, phrase: string) {
  const response = window.prompt(`${action}\n\nType ${phrase} to confirm.`);
  return response === phrase;
}

function confirmAction(message: string) {
  return window.confirm(message);
}

function shortenMiddle(value: unknown, start = 7, end = 5) {
  if (value === null || value === undefined || value === "") return "—";

  const text = String(value);
  if (text.length <= start + end + 1) return text;

  return `${text.slice(0, start)}…${text.slice(-end)}`;
}

function parseDiscordChannelInput(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const mentionMatch = trimmed.match(/^<#(\d{15,25})>$/);
  if (mentionMatch) return mentionMatch[1];

  const idMatch = trimmed.match(/^(\d{15,25})$/);
  if (idMatch) return idMatch[1];

  return null;
}

function normalizeChannel(value: unknown): AdminChannel | null {
  if (!isRecord(value)) return null;

  const id = valueToString(pickRecordValue(value, ["id", "channel_id", "channelId"]), null);
  const name = valueToString(pickRecordValue(value, ["name", "channelName", "channel_name"]), null);

  if (!id || !name) return null;

  const parentName = valueToString(pickRecordValue(value, ["parentName", "parent_name", "category"]), null);
  const guildName = valueToString(pickRecordValue(value, ["guildName", "guild_name", "guild"]), null) ?? undefined;
  const label = valueToString(pickRecordValue(value, ["label"]), null) ?? `${parentName ? `${parentName} / ` : ""}#${name}`;

  return {
    id,
    name,
    label,
    guildName,
    parentName,
    canSendMessages: Boolean(value.canSendMessages ?? value.can_send_messages),
    canCreateInvite: Boolean(value.canCreateInvite ?? value.can_create_invite),
    usableForGiveaways: Boolean(value.usableForGiveaways ?? value.usable_for_giveaways ?? value.canSendMessages ?? value.can_send_messages),
    usableForInvites: Boolean(value.usableForInvites ?? value.usable_for_invites ?? value.canCreateInvite ?? value.can_create_invite),
  };
}

function channelDisplayName(channel: AdminChannel) {
  return channel.label ?? `${channel.parentName ? `${channel.parentName} / ` : ""}#${channel.name}`;
}

function isAdminSection(value: string | null): value is AdminSection {
  return SECTIONS.some((item) => item.id === value);
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<AdminSection>(() => {
    const requested = searchParams.get("section");
    return isAdminSection(requested) ? requested : "overview";
  });
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [invites, setInvites] = useState<InviteEvent[]>([]);
  const [inviteLeaderboard, setInviteLeaderboard] = useState<UnknownRecord[]>([]);
  const [logs, setLogs] = useState<ActivityItem[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [roles, setRoles] = useState<AdminRoleOption[]>([]);
  const [search, setSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [giveawayCreateOpen, setGiveawayCreateOpen] = useState(false);
  const [inviteCreateOpen, setInviteCreateOpen] = useState(false);
  const [addAltTarget, setAddAltTarget] = useState<{
    discord: string;
    main: string;
  } | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, playersRes, giveawaysRes, invitesRes, logsRes, channelsRes, rolesRes] = await Promise.all([
        fetch("/api/admin/status", { cache: "no-store" }),
        fetch("/api/admin/players", { cache: "no-store" }),
        fetch("/api/admin/giveaways", { cache: "no-store" }),
        fetch("/api/admin/invites", { cache: "no-store" }),
        fetch("/api/admin/logs", { cache: "no-store" }),
        fetch("/api/admin/channels", { cache: "no-store" }),
        fetch("/api/admin/roles", { cache: "no-store" }),
      ]);

      if (statusRes.ok) {
        const data = (await statusRes.json()) as StatusData;
        setStatus(data);
        if (data.user) setCurrentUser(data.user);
      }

      if (playersRes.ok) {
        const data = (await playersRes.json().catch(() => ({}))) as unknown;
        const nextPlayers = firstArray(data, ["players", "trackedPlayers", "users", "entries", "data"])
          .map(normalizePlayerRow)
          .filter((player): player is Player => player !== null);
        const nextLinks = firstArray(data, ["links", "robloxLinks", "alts", "user_alts"])
          .map(normalizeLinkRow)
          .filter((link): link is LinkRow => link !== null);

        setPlayers(nextPlayers);
        setLinks(nextLinks);
      }

      if (giveawaysRes.ok) {
        const data = (await giveawaysRes.json()) as UnknownRecord;
        const list = asArray<Giveaway>(data.giveaways).filter(isRealGiveaway);
        const active = isRecord(data.active) ? (data.active as Giveaway) : null;
        setGiveaways(isRealGiveaway(active) && !list.length ? [active] : list);
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

      if (channelsRes.ok) {
        const data = (await channelsRes.json().catch(() => ({}))) as UnknownRecord;
        const nextChannels = firstArray(data, ["channels", "textChannels", "data"])
          .map(normalizeChannel)
          .filter((channel): channel is AdminChannel => channel !== null);
        setChannels(nextChannels);
      }

      if (rolesRes.ok) {
        const data = (await rolesRes.json().catch(() => ({}))) as UnknownRecord;
        const nextRoles = firstArray(data, ["roles", "data"])
          .filter(isRecord)
          .map((role) => ({
            id: valueToString(pickRecordValue(role, ["id", "role_id", "roleId"]), "") ?? "",
            name: valueToString(pickRecordValue(role, ["name", "roleName", "role_name"]), "Role") ?? "Role",
            guildName: valueToString(pickRecordValue(role, ["guildName", "guild_name", "guild"]), null) ?? undefined,
            memberCount: pickRecordNumber(role, ["memberCount", "member_count"], 0),
          }))
          .filter((role) => role.id);
        setRoles(nextRoles);
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

  function showToast(message: string, tone: "success" | "error" | "info" = "info") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function postAction(endpoint: string, body: UnknownRecord = {}) {
    setActionStatus("Running action...");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: UnknownRecord = {};

      try {
        data = text ? (JSON.parse(text) as UnknownRecord) : {};
      } catch {
        data = text.trim() ? { error: text.trim() } : {};
      }

      if (!res.ok) {
        const message = data.error ?? data.message ?? `Action failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const message = String(data.message ?? "Action completed");
      setActionStatus(message);
      showToast(message, "success");
      await loadAdminData();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setActionStatus(message);
      showToast(message, "error");
      return false;
    } finally {
      window.setTimeout(() => setActionStatus(""), 3500);
    }
  }

  function createGiveaway() {
    setGiveawayCreateOpen(true);
  }

  async function submitGiveaway(values: {
    channel_id: string;
    prize: string;
    winners: number;
    invites_per_entry: number;
    duration_minutes: number;
    thumbnail?: string;
  }) {
    const success = await postAction("/api/admin/giveaway/create", values);
    if (success) setGiveawayCreateOpen(false);
  }

  function startInviteEvent() {
    setInviteCreateOpen(true);
  }

  async function submitInviteEvent(values: {
    channel_id: string;
    duration_hours: number;
    reward: string;
  }) {
    const success = await postAction("/api/admin/invite/start", values);
    if (success) setInviteCreateOpen(false);
  }

  async function submitAddAlt(values: { discord_id: string; roblox_username: string }) {
    const success = await postAction("/api/admin/player/add-alt", values);
    if (success) setAddAltTarget(null);
  }

  const canAdmin = currentUser?.role === "owner" || currentUser?.role === "officer";
  const isOwner = currentUser?.role === "owner";
  const canBroadcast = status?.permissions?.broadcast ?? isOwner;
  const visibleSections = useMemo(
    () => (canBroadcast ? SECTIONS : SECTIONS.filter((item) => item.id !== "broadcast")),
    [canBroadcast]
  );
  const activeSection = visibleSections.find((item) => item.id === section) ?? visibleSections[0];

  useEffect(() => {
    const requested = searchParams.get("section");
    if (!isAdminSection(requested)) return;
    if (!visibleSections.some((item) => item.id === requested)) return;
    setSection(requested);
  }, [searchParams, visibleSections]);

  function selectSection(nextSection: AdminSection) {
    setSection(nextSection);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", nextSection);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (canBroadcast || section !== "broadcast") return;

    const timer = window.setTimeout(() => setSection("overview"), 0);
    return () => window.clearTimeout(timer);
  }, [canBroadcast, section]);

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
    const map = new Map<string, { discord: string; main: string; mainRobloxId: string | null; role: string | null; alts: string[] }>();

    for (const player of players) {
      const discord = String(player.discord ?? player.discord_id ?? "");
      if (!discord) continue;
      const current = map.get(discord) ?? { discord, main: "—", mainRobloxId: null, role: null, alts: [] };
      const robloxId = player.robloxId ?? player.roblox_id ?? null;
      const name = String(player.username ?? robloxId ?? "—");
      const role = String(player.clanRank ?? player.clan_rank ?? "").toLowerCase();
      if (current.main === "—") {
        current.main = name;
        current.mainRobloxId = robloxId ? String(robloxId) : null;
      }
      if (role) current.role = role;
      map.set(discord, current);
    }

    for (const link of links) {
      const discord = String(link.discord ?? link.discord_id ?? "");
      if (!discord) continue;
      const current = map.get(discord) ?? { discord, main: "—", mainRobloxId: null, role: null, alts: [] };
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
                {visibleSections.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSection(item.id)}
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
                    {activeSection.icon} {activeSection.label}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                    {SECTION_DESCRIPTIONS[activeSection.id]}
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
                        if (confirmTypedAction("Restart the bot process? Only use this if your host auto-restarts it.", "RESTART")) {
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

            {section === "broadcast" && (
              <BroadcastSection
                roles={roles}
                onToast={(message, tone) => showToast(message, tone)}
              />
            )}

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

            {section === "links" && (
              <LinksSection
                rows={linksByDiscord}
                onAction={postAction}
                onAddAlt={(row) => setAddAltTarget({ discord: row.discord, main: row.main })}
              />
            )}

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

      <CreateGiveawayModal
        open={giveawayCreateOpen}
        channels={channels}
        onClose={() => setGiveawayCreateOpen(false)}
        onSubmit={submitGiveaway}
      />

      <CreateInviteEventModal
        open={inviteCreateOpen}
        channels={channels}
        onClose={() => setInviteCreateOpen(false)}
        onSubmit={submitInviteEvent}
      />

      <AddAltModal
        target={addAltTarget}
        onClose={() => setAddAltTarget(null)}
        onSubmit={submitAddAlt}
      />

      {toast && <Toast message={toast.message} tone={toast.tone} />}

      <style jsx global>{`
        .admin-button {
          border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
          border-radius: 999px;
          background: color-mix(in srgb, var(--primary) 13%, transparent);
          padding: 0.55rem 0.9rem;
          color: var(--foreground);
          font-size: 0.85rem;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }
        .admin-button:hover:not(:disabled) {
          background: color-mix(in srgb, var(--primary) 22%, transparent);
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
          transform: translateY(-1px);
        }
        .admin-button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .admin-input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--foreground);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          outline: none;
        }
        .admin-input:focus {
          border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
        }
        .admin-input::placeholder {
          color: color-mix(in srgb, var(--foreground) 35%, transparent);
        }
        .admin-label {
          color: color-mix(in srgb, var(--foreground) 55%, transparent);
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

function ModalShell({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        className="relative z-10 w-full max-w-xl rounded-3xl border p-5 shadow-2xl sm:p-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--background) 92%, var(--primary) 8%), var(--background))",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45), 0 0 40px var(--glow)",
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="admin-label text-xs uppercase tracking-[0.25em]">Admin Action</div>
            <h3 className="mt-1 text-2xl font-bold" style={{ color: "var(--foreground)" }}>{title}</h3>
          </div>
          <button
            type="button"
            className="rounded-full border px-3 py-1 transition hover:scale-105"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChannelField({
  channels,
  value,
  onChange,
  purpose,
}: {
  channels: AdminChannel[];
  value: string;
  onChange: (value: string) => void;
  purpose: "giveaway" | "invite";
}) {
  const usableChannels = channels.filter((channel) =>
    purpose === "invite"
      ? channel.usableForInvites || channel.canCreateInvite
      : channel.usableForGiveaways || channel.canSendMessages
  );

  return (
    <div className="space-y-2">
      <label className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">
        Discord Channel
      </label>
      {usableChannels.length > 0 && (
        <select
          className="admin-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a channel...</option>
          {usableChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channelDisplayName(channel)}
              {channel.guildName ? ` · ${channel.guildName}` : ""}
            </option>
          ))}
        </select>
      )}
      <input
        className="admin-input"
        placeholder="Or paste channel ID / #channel mention"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="admin-label text-xs">
        {usableChannels.length
          ? "Channels are loaded from the bot. You can still paste an ID manually."
          : "No channels were loaded from the bot, so paste a channel ID or channel mention."}
      </p>
    </div>
  );
}

function CreateGiveawayModal({
  open,
  channels,
  onClose,
  onSubmit,
}: {
  open: boolean;
  channels: AdminChannel[];
  onClose: () => void;
  onSubmit: (values: {
    channel_id: string;
    prize: string;
    winners: number;
    invites_per_entry: number;
    duration_minutes: number;
    thumbnail?: string;
  }) => Promise<void>;
}) {
  const [channelId, setChannelId] = useState("");
  const [prize, setPrize] = useState("");
  const [winners, setWinners] = useState(1);
  const [invitesPerEntry, setInvitesPerEntry] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [thumbnail, setThumbnail] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    const parsedChannel = parseDiscordChannelInput(channelId);

    if (!parsedChannel) {
      setError("Choose a Discord channel or paste a valid channel ID / channel mention.");
      return;
    }

    if (!prize.trim()) {
      setError("Prize is required.");
      return;
    }

    setError("");
    await onSubmit({
      channel_id: parsedChannel,
      prize: prize.trim(),
      winners: Math.max(1, Number(winners) || 1),
      invites_per_entry: Math.max(1, Number(invitesPerEntry) || 1),
      duration_minutes: Math.max(1, Number(durationMinutes) || 60),
      thumbnail: thumbnail.trim() || undefined,
    });
  }

  return (
    <ModalShell open={open} title="Create Giveaway" onClose={onClose}>
      <div className="space-y-4">
        <ChannelField channels={channels} value={channelId} onChange={setChannelId} purpose="giveaway" />
        <LabeledInput label="Prize" value={prize} onChange={setPrize} placeholder="Huge pet, gems, booth, etc." />
        <div className="grid gap-4 sm:grid-cols-3">
          <LabeledNumber label="Winners" value={winners} onChange={setWinners} min={1} />
          <LabeledNumber label="Invites / Entry" value={invitesPerEntry} onChange={setInvitesPerEntry} min={1} />
          <LabeledNumber label="Duration Minutes" value={durationMinutes} onChange={setDurationMinutes} min={1} />
        </div>
        <LabeledInput label="Thumbnail URL" value={thumbnail} onChange={setThumbnail} placeholder="Optional image URL" />
        {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="admin-button" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-button" onClick={() => void submit()}>Create Giveaway</button>
        </div>
      </div>
    </ModalShell>
  );
}

function CreateInviteEventModal({
  open,
  channels,
  onClose,
  onSubmit,
}: {
  open: boolean;
  channels: AdminChannel[];
  onClose: () => void;
  onSubmit: (values: { channel_id: string; duration_hours: number; reward: string }) => Promise<void>;
}) {
  const [channelId, setChannelId] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [reward, setReward] = useState("Giveaway entries");
  const [error, setError] = useState("");

  async function submit() {
    const parsedChannel = parseDiscordChannelInput(channelId);

    if (!parsedChannel) {
      setError("Choose a Discord channel or paste a valid channel ID / channel mention.");
      return;
    }

    setError("");
    await onSubmit({
      channel_id: parsedChannel,
      duration_hours: Math.max(1, Number(durationHours) || 24),
      reward: reward.trim() || "Giveaway entries",
    });
  }

  return (
    <ModalShell open={open} title="Create Invite Event" onClose={onClose}>
      <div className="space-y-4">
        <ChannelField channels={channels} value={channelId} onChange={setChannelId} purpose="invite" />
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledNumber label="Duration Hours" value={durationHours} onChange={setDurationHours} min={1} />
          <LabeledInput label="Reward" value={reward} onChange={setReward} placeholder="Giveaway entries" />
        </div>
        {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="admin-button" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-button" onClick={() => void submit()}>Create Invite Event</button>
        </div>
      </div>
    </ModalShell>
  );
}

function AddAltModal({
  target,
  onClose,
  onSubmit,
}: {
  target: { discord: string; main: string } | null;
  onClose: () => void;
  onSubmit: (values: { discord_id: string; roblox_username: string }) => Promise<void>;
}) {
  const [robloxUsername, setRobloxUsername] = useState("");
  const [error, setError] = useState("");

  const open = Boolean(target);

  async function submit() {
    const username = robloxUsername.trim();

    if (!target) return;

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      setError("Enter a valid Roblox username, 3-20 characters, letters, numbers, and underscores only.");
      return;
    }

    setError("");
    await onSubmit({
      discord_id: target.discord,
      roblox_username: username,
    });
  }

  return (
    <ModalShell open={open} title="Add Roblox Alt" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="admin-label text-xs uppercase tracking-[0.2em]">Discord User</div>
          <div className="mt-1 font-mono text-sm">{target?.discord ?? "—"}</div>
          <div className="admin-label mt-3 text-xs uppercase tracking-[0.2em]">Main Roblox</div>
          <div className="mt-1 font-semibold">{target?.main ?? "—"}</div>
        </div>
        <LabeledInput
          label="Alt Roblox Username"
          value={robloxUsername}
          onChange={setRobloxUsername}
          placeholder="Roblox username to add as alt"
        />
        {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="admin-button" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-button" onClick={() => void submit()}>Add Alt</button>
        </div>
      </div>
    </ModalShell>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">{label}</span>
      <input
        className="admin-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">{label}</span>
      <input
        type="number"
        min={min}
        className="admin-input"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toast({ message, tone }: { message: string; tone: "success" | "error" | "info" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
      : tone === "error"
      ? "border-red-500/30 bg-red-500/15 text-red-100"
      : "border-white/10 bg-white/10 text-white";

  return (
    <div className={`fixed bottom-5 right-5 z-[90] max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toneClass}`}>
      {message}
    </div>
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
  onAction: AdminAction;
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

function BroadcastSection({
  roles,
  onToast,
}: {
  roles: AdminRoleOption[];
  onToast: (message: string, tone: "success" | "error" | "info") => void;
}) {
  const [audience, setAudience] = useState("everyone");
  const [delivery, setDelivery] = useState("dm");
  const [style, setStyle] = useState("plain");
  const [value, setValue] = useState("");
  const [roleId, setRoleId] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const needsValue = ["below_points", "above_points", "bottom_n", "top_n", "custom_user"].includes(audience);
  const needsRole = audience === "discord_role";

  const payload = useMemo(
    () => ({
      audience,
      delivery,
      style,
      value,
      role_id: roleId,
      message,
    }),
    [audience, delivery, message, roleId, style, value]
  );

  async function requestBroadcast(endpoint: string) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: UnknownRecord = {};

    try {
      data = text ? (JSON.parse(text) as UnknownRecord) : {};
    } catch {
      data = text.trim() ? { error: text.trim() } : {};
    }

    if (!res.ok) throw new Error(String(data.error ?? `Broadcast request failed (${res.status})`));
    return data;
  }

  async function loadPreview() {
    if (!message.trim()) {
      setStatus("Message is required.");
      onToast("Message is required.", "error");
      return;
    }
    if (needsRole && !roleId) {
      setStatus("Choose a Discord role.");
      onToast("Choose a Discord role.", "error");
      return;
    }
    if (needsValue && !value.trim()) {
      setStatus("This audience needs a value.");
      onToast("This audience needs a value.", "error");
      return;
    }

    setLoading(true);
    setStatus("Loading preview...");
    try {
      const data = await requestBroadcast("/api/admin/broadcast/preview");
      setPreview({
        recipientCount: Number(data.recipientCount ?? 0),
        deliverableCount: Number(data.deliverableCount ?? 0),
        missingTicketCount: Number(data.missingTicketCount ?? 0),
        sampleRecipients: asArray<BroadcastRecipient>(data.sampleRecipients),
        missingTicketRecipients: asArray<BroadcastRecipient>(data.missingTicketRecipients),
      });
      setStatus("Preview ready. Review it before sending.");
      onToast("Broadcast preview ready", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      setStatus(msg);
      onToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function sendBroadcast() {
    if (!preview) {
      await loadPreview();
      return;
    }

    const confirmText = preview.recipientCount > 25 ? "SEND" : "YES";
    if (!confirmTypedAction(`Send this broadcast to ${preview.recipientCount} matched recipient(s)?`, confirmText)) {
      return;
    }

    setLoading(true);
    setStatus("Sending broadcast...");
    try {
      const data = await requestBroadcast("/api/admin/broadcast/send");
      const sent = Number(data.sent ?? 0);
      const failed = Number(data.failed ?? 0);
      setStatus(`Broadcast complete: ${sent} sent, ${failed} failed.`);
      onToast(`Broadcast complete: ${sent} sent, ${failed} failed.`, failed ? "info" : "success");
      setPreview(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Broadcast failed";
      setStatus(msg);
      onToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
      <Panel title="Create Broadcast">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Audience</span>
              <select className="admin-input" value={audience} onChange={(event) => { setAudience(event.target.value); setPreview(null); }}>
                <option value="everyone">Everyone</option>
                <option value="below_points">Below X points</option>
                <option value="above_points">Above X points</option>
                <option value="zero_points">Exactly 0 points</option>
                <option value="bottom_n">Bottom N players</option>
                <option value="top_n">Top N players</option>
                <option value="members">Members</option>
                <option value="officers">Officers</option>
                <option value="discord_role">Discord role</option>
                <option value="custom_user">Custom user(s)</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Delivery</span>
              <select className="admin-input" value={delivery} onChange={(event) => { setDelivery(event.target.value); setPreview(null); }}>
                <option value="dm">DM</option>
                <option value="ticket">Ticket</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Style</span>
              <select className="admin-input" value={style} onChange={(event) => setStyle(event.target.value)}>
                <option value="plain">Plain text</option>
                <option value="embed">Embed</option>
              </select>
            </label>
          </div>

          {needsValue && (
            <LabeledInput
              label={audience === "custom_user" ? "Discord IDs / mentions" : "Filter Value"}
              value={value}
              onChange={(next) => { setValue(next); setPreview(null); }}
              placeholder={audience === "custom_user" ? "Paste Discord IDs or mentions" : "Example: 15 or 1000"}
            />
          )}

          {needsRole && (
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Discord Role</span>
              <select className="admin-input" value={roleId} onChange={(event) => { setRoleId(event.target.value); setPreview(null); }}>
                <option value="">Select a role...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}{role.guildName ? ` · ${role.guildName}` : ""}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-2">
            <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Message</span>
            <textarea
              className="admin-input min-h-36 resize-y"
              value={message}
              onChange={(event) => { setMessage(event.target.value); setPreview(null); }}
              placeholder="Clan war starts soon. Please prepare, {username}."
            />
            <span className="admin-label text-xs">Placeholders: {"{username}"}, {"{points}"}, {"{rank}"}</span>
          </label>

          {status && (
            <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              {status}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button className="admin-button" type="button" disabled={loading} onClick={() => void loadPreview()}>
              Preview
            </button>
            <button className="admin-button" type="button" disabled={loading || !preview} onClick={() => void sendBroadcast()}>
              Send Broadcast
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Preview">
        {preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Matched" value={preview.recipientCount} />
              <MiniStat label="Will Attempt" value={preview.deliverableCount} />
              <MiniStat label="No Ticket" value={preview.missingTicketCount} />
            </div>
            <div>
              <div className="admin-label mb-2 text-xs uppercase tracking-[0.2em]">Message Preview</div>
              <div
                className="rounded-2xl border p-4 text-sm whitespace-pre-wrap"
                style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }}
              >
                {style === "embed" && <div className="mb-2 font-semibold">📢 MCWV Broadcast</div>}
                {renderBroadcastPreviewMessage(message, preview.sampleRecipients[0])}
              </div>
            </div>

            <div>
              <div className="admin-label mb-2 text-xs uppercase tracking-[0.2em]">Sample Recipients</div>
              <div className="space-y-2">
                {preview.sampleRecipients.length ? (
                  preview.sampleRecipients.map((recipient, index) => (
                    <div key={safeId("broadcast-sample", recipient.discord_id, index)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                      <div className="font-medium">{recipient.username ?? "Unknown"}</div>
                      <div className="text-xs text-zinc-500">{recipient.points ?? 0} pts · rank {recipient.rank ?? "—"}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    No recipients matched this filter. If Everyone shows 0, the bot is not seeing linked users in its database.
                  </div>
                )}
              </div>
            </div>
            {preview.missingTicketRecipients.length > 0 && (
              <div>
                <div className="admin-label mb-2 text-xs uppercase tracking-[0.2em]">Missing Ticket</div>
                <div className="space-y-2">
                  {preview.missingTicketRecipients.slice(0, 8).map((recipient, index) => (
                    <div key={safeId("broadcast-missing", recipient.discord_id, index)} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      {recipient.username ?? recipient.discord_id} — no saved ticket
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Build a broadcast and click Preview to see recipient counts before sending.</p>
        )}
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
  onAction: AdminAction;
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
                const active = isActiveFlag(event.active) || String(status).toLowerCase() === "active";
                const inviteName = event.name ?? `Invite Event ${event.id ?? index + 1}`;

                return (
                  <tr key={safeId("invite", event.id, index)}>
                    <td className="py-4 font-medium">{inviteName}</td>
                    <td className="py-4"><span className={`rounded-full border px-3 py-1 text-xs ${statusTone(status)}`}>{status}</span></td>
                    <td className="py-4 text-zinc-400">{formatTime(event.start ?? event.start_time)}</td>
                    <td className="py-4 text-zinc-400">{formatTime(event.end ?? event.end_time)}</td>
                    <td className="py-4">{toDisplayValue(event.invites ?? 0)}</td>
                    <td className="py-4 text-zinc-400">{event.reward ?? "—"}</td>
                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="admin-button disabled:cursor-not-allowed disabled:opacity-40"
                          type="button"
                          disabled={!active}
                          onClick={() => {
                            if (confirmAction(`End ${inviteName}? This stops invite tracking for the event.`)) {
                              void onAction("/api/admin/invite/end", { id: event.id });
                            }
                          }}
                        >
                          End
                        </button>
                        <button
                          className="admin-button disabled:cursor-not-allowed disabled:opacity-40"
                          type="button"
                          disabled={!active}
                          onClick={() => {
                            if (confirmAction(`Pause ${inviteName}? Invite counts will stop until resumed.`)) {
                              void onAction("/api/admin/invite/pause", { id: event.id });
                            }
                          }}
                        >
                          Pause
                        </button>
                        <button
                          className="admin-button disabled:cursor-not-allowed disabled:opacity-40"
                          type="button"
                          disabled={active}
                          onClick={() => void onAction("/api/admin/invite/resume", { id: event.id })}
                        >
                          Resume
                        </button>
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
  onAction: AdminAction;
}) {
  return (
    <Panel
      title="Giveaways"
      right={<button className="admin-button" type="button" onClick={onCreate}>Create</button>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {giveaways.length ? giveaways.map((giveaway, index) => {
          const ends = giveaway.endsAt ?? giveaway.ends_at ?? giveaway.end_time;
          const active = isActiveFlag(giveaway.active);
          const prize = giveaway.prize ?? "Unknown prize";

          return (
            <div key={safeId("giveaway", giveaway.id, index)} className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Prize</div>
                  <h4 className="mt-2 text-xl font-bold">{prize}</h4>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(active ? "Active" : "Ended")}`}>
                  {active ? "Active" : "Ended"}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <MiniStat label="Entries" value={toDisplayValue(giveaway.entries ?? 0)} />
                <MiniStat label="Ends In" value={formatUptime(secondsUntil(ends))} />
                <MiniStat label="Winner Count" value={toDisplayValue(giveaway.winnerCount ?? giveaway.winner_count ?? giveaway.winners ?? 1)} />
                <MiniStat label="Invite Event" value={giveaway.linkedInviteEvent ?? giveaway.linked_invite_event ?? "Linked"} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="admin-button disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!active}
                  onClick={() => {
                    if (confirmAction(`End giveaway for ${prize}? Winners may be selected immediately.`)) {
                      void onAction("/api/admin/giveaway/end", { id: giveaway.id });
                    }
                  }}
                >
                  End
                </button>
                <button
                  className="admin-button"
                  type="button"
                  onClick={() => {
                    if (confirmAction(`Reroll giveaway for ${prize}? This may announce a new winner.`)) {
                      void onAction("/api/admin/giveaway/reroll", { id: giveaway.id });
                    }
                  }}
                >
                  Reroll
                </button>
                <button
                  className="admin-button-danger disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!active}
                  onClick={() => {
                    if (confirmAction(`Cancel giveaway for ${prize}? This cannot be undone.`)) {
                      void onAction("/api/admin/giveaway/cancel", { id: giveaway.id });
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-zinc-500 md:col-span-2 xl:col-span-3">
            <div className="font-medium text-zinc-300">No giveaway is currently running.</div>
            <div className="mt-1 text-sm">Create a giveaway linked to an invite event.</div>
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
  onAction: AdminAction;
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
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="w-16 px-3 pb-3">Avatar</th>
              <th className="w-56 px-3 pb-3">Username</th>
              <th className="w-44 px-3 pb-3">Discord</th>
              <th className="w-32 px-3 pb-3">Status</th>
              <th className="w-36 px-3 pb-3">Current World</th>
              <th className="w-40 px-3 pb-3">Last Seen</th>
              <th className="w-32 px-3 pb-3">Clan Rank</th>
              <th className="w-24 px-3 pb-3">Points</th>
              <th className="w-64 px-3 pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {players.length ? players.map((player, index) => {
              const id = player.robloxId ?? player.roblox_id ?? player.id;
              const status = player.status ?? "Unknown";
              const username = player.username ?? "Unknown";
              const discord = player.discord ?? player.discord_id ?? null;
              const discordText = discord === null || discord === undefined || discord === "" ? "" : String(discord);
              const protectedOwner = String(player.clanRank ?? player.clan_rank ?? "").toLowerCase() === "owner";

              return (
                <tr key={safeId("player", id, index)} className="transition hover:bg-white/[0.03]">
                  <td className="px-3 py-4">
                    {player.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatar} alt="" className="h-10 w-10 rounded-full border border-white/10" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">👤</div>
                    )}
                  </td>
                  <td className="px-3 py-4 font-medium">
                    <div className="max-w-[13rem] truncate" title={String(username)}>{username}</div>
                  </td>
                  <td className="px-3 py-4 font-mono text-xs text-zinc-400" title={discordText || undefined}>
                    {shortenMiddle(discordText)}
                  </td>
                  <td className="px-3 py-4">
                    <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${statusTone(status)}`}>{status}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-zinc-400">{player.currentWorld ?? player.current_world ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-zinc-400">{formatTime(player.lastSeen ?? player.last_seen)}</td>
                  <td className="whitespace-nowrap px-3 py-4">{player.clanRank ?? player.clan_rank ?? "—"}</td>
                  <td className="px-3 py-4 tabular-nums">{toDisplayValue(player.points ?? 0)}</td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Link className="admin-button" href={`/profile/${encodeURIComponent(String(username ?? id ?? ""))}`}>Profile</Link>
                      <button className="admin-button" type="button" onClick={() => void onAction("/api/admin/player/sync", { roblox_id: id })}>Sync</button>
                      <button
                        className="admin-button-danger disabled:cursor-not-allowed disabled:opacity-40"
                        type="button"
                        disabled={protectedOwner}
                        title={protectedOwner ? "Owner accounts cannot be removed from here." : undefined}
                        onClick={() => {
                          if (confirmAction(`Remove ${username} from tracking and unlink their Roblox account?`)) {
                            void onAction("/api/admin/player/remove", { roblox_id: id });
                          }
                        }}
                      >
                        Remove
                      </button>
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
  onAddAlt,
}: {
  rows: { discord: string; main: string; mainRobloxId: string | null; role: string | null; alts: string[] }[];
  onAction: AdminAction;
  onAddAlt: (row: { discord: string; main: string; mainRobloxId: string | null; role: string | null; alts: string[] }) => void;
}) {
  return (
    <Panel title="Roblox Links">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="w-44 px-3 pb-3">Discord User</th>
              <th className="w-56 px-3 pb-3">Main Roblox</th>
              <th className="px-3 pb-3">Alts</th>
              <th className="w-64 px-3 pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.length ? rows.map((row, index) => {
              const protectedOwner = String(row.role ?? "").toLowerCase() === "owner";

              return (
              <tr key={safeId("link", row.discord, index)} className="transition hover:bg-white/[0.03]">
                <td className="px-3 py-4 font-mono text-xs text-zinc-400" title={row.discord}>
                  {shortenMiddle(row.discord)}
                </td>
                <td className="px-3 py-4 font-medium">
                  <div className="max-w-[14rem] truncate" title={row.main}>{row.main}</div>
                </td>
                <td className="px-3 py-4">
                  {row.alts.length ? (
                    <div className="flex flex-wrap gap-2">
                      {row.alts.map((alt, altIndex) => (
                        <span
                          key={safeId("alt", `${row.discord}-${alt}`, altIndex)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300"
                          title={alt}
                        >
                          {alt}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-500">No alts</span>
                  )}
                </td>
                <td className="px-3 py-4 text-right">
                  <div className="flex justify-end gap-2 whitespace-nowrap">
                    <button
                      className="admin-button"
                      type="button"
                      disabled={!row.mainRobloxId}
                      onClick={() => {
                        if (row.mainRobloxId) {
                          void onAction("/api/admin/player/sync", { roblox_id: row.mainRobloxId });
                        }
                      }}
                    >
                      Sync
                    </button>
                    <button
                      className="admin-button"
                      type="button"
                      onClick={() => onAddAlt(row)}
                    >
                      Add Alt
                    </button>
                    <button
                      className="admin-button-danger disabled:cursor-not-allowed disabled:opacity-40"
                      type="button"
                      disabled={protectedOwner}
                      title={protectedOwner ? "Owner accounts cannot be unlinked from here." : undefined}
                      onClick={() => {
                        if (confirmAction(`Unlink all Roblox accounts for Discord ID ${row.discord}?`)) {
                          void onAction("/api/admin/player/remove", { discord_id: row.discord });
                        }
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                </td>
              </tr>
              );
            }) : (
              <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No Roblox links found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function WarSection({ overview }: { overview: UnknownRecord | undefined }) {
  const rawCurrentWar = readString(overview, ["currentWar"], "");
  const normalizedWar = rawCurrentWar.trim().toLowerCase();
  const hasActiveWar =
    Boolean(normalizedWar) &&
    !["—", "unknown", "mcwv", "no active war", "current battle unknown", "active battle unknown"].includes(normalizedWar);
  const currentWar = hasActiveWar ? rawCurrentWar : "No active war detected";
  const progress = hasActiveWar
    ? Math.max(0, Math.min(100, readNumber(overview, ["progressPct", "progress", "warProgress"], 0)))
    : 0;

  return (
    <div className="space-y-6">
      <Panel title="Current Battle">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Battle</div>
              <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(hasActiveWar ? "Active" : "Inactive")}`}>
                {hasActiveWar ? "Active" : "Inactive"}
              </span>
            </div>
            <h3 className="mt-2 text-3xl font-bold">{currentWar}</h3>
            {!hasActiveWar && (
              <p className="mt-2 text-sm text-zinc-500">
                The bot is online, but no active battle name has been reported yet.
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MiniStat label="Timer" value={hasActiveWar ? readString(overview, ["timer", "endsIn"], "—") : "—"} />
              <MiniStat label="Clan Points" value={hasActiveWar ? readString(overview, ["clanPoints", "totalPoints"], "—") : "—"} />
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
              {hasActiveWar ? (
                <>
                  <p>War data is connected. Contribution deltas and battle history can be layered in next.</p>
                  <p>Use the Overview quick action to force a fresh war sync.</p>
                </>
              ) : (
                <>
                  <p>No active war data is available yet, so leaderboard and contribution graphs are hidden.</p>
                  <p>Use Sync War after the next battle starts to pull fresh battle state.</p>
                </>
              )}
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
      <ActivityList items={logs} limit={500} showActor />
    </Panel>
  );
}

function SettingsSection({ bot, isOwner }: { bot: UnknownRecord | undefined; isOwner: boolean }) {
  const botConnected = bot?.connected === true;
  const adminApiConfigured = bot?.configured === true;
  const adminApiStatus = botConnected
    ? "Connected"
    : adminApiConfigured
    ? "Configured, offline"
    : "Not configured";

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
          <p>API keys, Discord webhooks, and bot token values stay server-side. This panel only shows safe connection health.</p>
          <MiniStat label="Bot Token" value={botConnected ? "Configured" : "Not visible"} />
          <MiniStat label="Admin API" value={adminApiStatus} />
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

function ActivityList({
  items,
  limit = 12,
  showActor = false,
}: {
  items: ActivityItem[];
  limit?: number;
  showActor?: boolean;
}) {
  if (!items.length) {
    return <p className="text-sm text-zinc-500">No log entries yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.slice(0, limit).map((item, index) => {
        const level = item.level ?? "info";
        return (
          <div key={safeId("activity", item.id, index)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-fit rounded-full border px-3 py-1 text-xs capitalize ${levelTone(level)}`}>{level}</span>
                {showActor && item.actorUsername && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                    By {item.actorUsername}
                  </span>
                )}
                {showActor && item.action && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
                    {item.action}
                  </span>
                )}
              </div>
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
