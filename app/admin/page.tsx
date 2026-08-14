"use client";

import Navbar from "@/components/Navbar";
import DiscordMarkdown from "@/components/DiscordMarkdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
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
  onLoa?: boolean;
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
  roblox_id?: string | number;
  role?: string;
  ticket_channel_id?: string | number | null;
  points?: number;
  pph?: number;
  change5m?: number;
  rank?: number | null;
};

type BroadcastPreview = {
  recipientCount: number;
  deliverableCount: number;
  missingTicketCount: number;
  sampleRecipients: BroadcastRecipient[];
  missingTicketRecipients: BroadcastRecipient[];
};

type BroadcastTab = "send" | "templates" | "schedules" | "history";

type BroadcastTemplate = {
  id: number;
  name: string;
  audience: string;
  value: string;
  delivery: string;
  style: string;
  message: string;
  imageUrl?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

type BroadcastSchedule = {
  id: number;
  name: string;
  kind: string;
  audience: string;
  value: string;
  delivery: string;
  style: string;
  message: string;
  topN: number | null;
  hoursBeforeEnd: number | null;
  runAt?: string | null;
  enabled: boolean;
  createdBy?: string | null;
  lastFiredAt?: string | null;
  lastFiredBattle?: string | null;
};

type BroadcastSend = {
  id: number;
  actor?: string | null;
  source: string;
  templateId?: number | null;
  audience?: string | null;
  value?: string | null;
  delivery?: string | null;
  style?: string | null;
  message: string;
  imageUrl?: string;
  battleKey?: string | null;
  matchedCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  sentAt?: string | null;
  conversionCheckedAt?: string | null;
  conversionZeroAtSend?: number | null;
  conversionScorers?: number | null;
  conversionPoints?: number | null;
};

type BroadcastSendRecipient = {
  username?: string | null;
  discordId?: string | null;
  robloxId?: string | null;
  pointsAtSend: number;
  delivered: boolean;
  error?: string | null;
};

type BroadcastHistoryStats = {
  sends: number;
  delivered: number;
  conversions: number;
  pointsGained: number;
  pending: number;
};

const BROADCAST_TABS: { id: BroadcastTab; label: string; icon: string }[] = [
  { id: "send", label: "Send", icon: "✉️" },
  { id: "templates", label: "Templates", icon: "📄" },
  { id: "schedules", label: "Schedules", icon: "⏰" },
  { id: "history", label: "History", icon: "📜" },
];

const BROADCAST_AUDIENCE_LABELS: Record<string, string> = {
  everyone: "Everyone",
  below_points: "Below X pts",
  above_points: "Above X pts",
  zero_points: "Zero points",
  bottom_n: "Bottom N",
  top_n: "Top N",
  members: "Members",
  officers: "Officers",
  discord_role: "Discord role",
  custom_user: "Custom users",
};

const BROADCAST_SCHEDULE_AUDIENCE_OPTIONS: { id: string; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "below_points", label: "Below X points" },
  { id: "above_points", label: "Above X points" },
  { id: "zero_points", label: "Exactly 0 points" },
  { id: "bottom_n", label: "Bottom N players" },
  { id: "top_n", label: "Top N players" },
  { id: "members", label: "Members" },
  { id: "officers", label: "Officers" },
];

const BROADCAST_SCHEDULE_KINDS: { id: string; label: string; icon: string; blurb: string }[] = [
  { id: "one_time", label: "One-time", icon: "📅", blurb: "Fires once at a date & time you pick, then disables itself." },
  { id: "war_midpoint", label: "Mid-war", icon: "⚔️", blurb: "Fires once per war, just after the halfway point." },
  { id: "war_final_hours", label: "Final hours", icon: "⚠️", blurb: "Fires once per war, X hours before it ends." },
  { id: "war_end_congrats", label: "Congrats", icon: "🏆", blurb: "DMs the top N scorers of each war when it ends." },
];

function broadcastAudienceLabel(audience?: string | null, value?: string | null) {
  const label = BROADCAST_AUDIENCE_LABELS[String(audience ?? "everyone")] ?? String(audience ?? "everyone");
  if (value && ["below_points", "above_points", "bottom_n", "top_n"].includes(String(audience))) {
    return `${label} (${value})`;
  }
  return label;
}

function broadcastSourceMeta(source?: string | null) {
  switch (String(source ?? "")) {
    case "hub":
      return { icon: "🌐", label: "Hub", chip: "border-sky-500/30 bg-sky-500/10 text-sky-200" };
    case "scheduler":
      return { icon: "⏰", label: "Auto", chip: "border-amber-500/30 bg-amber-500/10 text-amber-200" };
    case "auto_congrats":
      return { icon: "🏆", label: "Congrats", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" };
    default:
      return { icon: "💬", label: "Discord", chip: "border-violet-500/30 bg-violet-500/10 text-violet-200" };
  }
}

function broadcastScheduleKindMeta(kind?: string | null) {
  return BROADCAST_SCHEDULE_KINDS.find((item) => item.id === kind) ?? BROADCAST_SCHEDULE_KINDS[0];
}

function broadcastScheduleSummary(schedule: BroadcastSchedule) {
  const audience = broadcastAudienceLabel(schedule.audience, schedule.value);
  const delivery = schedule.delivery === "ticket" ? "Ticket" : "DM";
  switch (schedule.kind) {
    case "war_end_congrats":
      return `Top ${schedule.topN ?? 10} scorers · ${delivery} · ${schedule.style}`;
    case "war_final_hours":
      return `${schedule.hoursBeforeEnd ?? 24}h before war end · ${audience} · ${delivery} · ${schedule.style}`;
    case "war_midpoint":
      return `At war midpoint · ${audience} · ${delivery} · ${schedule.style}`;
    case "one_time": {
      const when = schedule.runAt ? formatTime(schedule.runAt) : "not set";
      return `Once at ${when} · ${audience} · ${delivery} · ${schedule.style}`;
    }
    default:
      return `${audience} · ${delivery} · ${schedule.style}`;
  }
}

function isoToLocalInput(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function broadcastTableMissingFrom(data: UnknownRecord) {
  return data?.missingTables === true;
}

type ActivityMember = {
  robloxId: string;
  username: string;
  avatarUrl?: string;
  discordId?: string | null;
  isAlt?: boolean;
  ownerUsername?: string | null;
  points: number;
  rank?: number | null;
  pph: number;
  pphReady: boolean;
  change5m: number;
  status: string;
  statusTone: string;
  statusUpdatedAt?: string | null;
  disconnects24h: number;
  disconnects1h: number;
  reasons: string[];
  needsAttention: boolean;
};

type ActivityData = {
  success: boolean;
  threshold: number;
  battleId: string | null;
  updatedAt: string;
  summary: {
    roster: number;
    needsAttention: number;
    lowPph: number;
    zeroPoints: number;
    offline: number;
    disconnectWatch: number;
  };
  needsAttention: ActivityMember[];
  lowPph: ActivityMember[];
  zeroPoints: ActivityMember[];
  offline: ActivityMember[];
  disconnects: ActivityMember[];
  topImprovers: ActivityMember[];
};

function renderBroadcastPreviewMessage(template: string, recipient?: BroadcastRecipient) {
  return template
    .replaceAll("{ping}", `@${String(recipient?.username ?? "ExampleUser")}`)
    .replaceAll("{username}", String(recipient?.username ?? "ExampleUser"))
    .replaceAll("{points}", String(recipient?.points ?? 0))
    .replaceAll("{pph}", String(recipient?.pph ?? 0))
    .replaceAll("{change5m}", String(recipient?.change5m ?? 0))
    .replaceAll("{rank}", String(recipient?.rank ?? "—"))
    .replaceAll("{clan_rank}", "12")
    .replaceAll("{war_time_left}", "2d 4h")
    .replaceAll("{next_player}", "NextPlayerUp")
    .replaceAll("{next_rank_gap}", "1,250")
    .replaceAll("{roblox_id}", String(recipient?.roblox_id ?? "123456"))
    .replaceAll("{discord_id}", String(recipient?.discord_id ?? "123456789012345678"))
    .replaceAll("{role}", String(recipient?.role ?? "member"))
    .replaceAll("{ticket}", "#ticket-123");
}

type TicketRow = {
  id?: number;
  ticketId: string;
  channelId?: string | null;
  guildId?: string | null;
  openerDiscordId?: string | null;
  robloxId?: string | null;
  robloxUsername?: string | null;
  status?: string | null;
  claimedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  screenshotsUploaded?: boolean | null;
};

type TicketDetail = TicketRow & {
  application?: {
    robloxUsername?: string | null;
    robloxId?: string | null;
    afk247?: string | null;
    activity?: string | null;
    liquidGems?: string | null;
    whyAccept?: string | null;
    submittedAt?: string | null;
  } | null;
  actions?: Array<{ action?: string; message?: string; actorDiscordId?: string | null; createdAt?: string | null }>;
  transcript?: { text?: string; createdAt?: string | null } | null;
};

type TicketBlacklistEntry = {
  discordId: string;
  reason?: string;
  createdBy?: string | null;
  createdAt?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
} | null;

type AdminAction = (endpoint: string, body?: UnknownRecord) => Promise<boolean>;

type AdminSection =
  | "overview"
  | "bot"
  | "activity"
  | "broadcast"
  | "events"
  | "tickets"
  | "players"
  | "links"
  | "war"
  | "logs"
  | "settings";

const SECTIONS: { id: AdminSection; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "bot", label: "Bot", icon: "🤖" },
  { id: "activity", label: "Activity", icon: "🚨" },
  { id: "broadcast", label: "Broadcast", icon: "📢" },
  { id: "events", label: "Events", icon: "🎉" },
  { id: "tickets", label: "Tickets", icon: "🎫" },
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
  activity:
    "Officer-only live war monitor for low PPH, zero points, offline members, disconnects, and top improvers.",
  broadcast:
    "Send themed staff broadcasts to filtered clan audiences through DMs or saved ticket channels.",
  events:
    "Manage invite competitions and Discord-style giveaways from one place.",
  tickets:
    "Review MCWV application tickets, application answers, actions, and transcripts.",
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
  if (normalized.includes("online") || normalized.includes("running") || normalized.includes("healthy") || normalized.includes("connected") || normalized.includes("enabled") || normalized.includes("active")) {
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

async function copyToClipboard(value: string) {
  if (!value.trim()) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function uniqueDiscordMentions(rows: ActivityMember[]) {
  return [...new Set(rows.map((row) => row.discordId).filter(Boolean).map((id) => `<@${id}>`))];
}

function buildActivityCopyMessage(rows: ActivityMember[], label: string, threshold: number) {
  const mentions = uniqueDiscordMentions(rows);
  if (!mentions.length) return "";

  const reason = label.toLowerCase();
  const details = rows
    .filter((row) => row.discordId)
    .slice(0, 20)
    .map((row) => `• ${row.username}: ${row.pphReady ? `${row.pph} PPH` : "PPH warming up"}, ${row.points} pts${row.reasons.length ? ` — ${row.reasons.join(", ")}` : ""}`)
    .join("\n");

  return [
    `The following members are on the **${reason}** activity list${label === "Low PPH" ? ` under **${threshold} PPH**` : ""}:`,
    "",
    mentions.join(" "),
    "",
    details,
    "",
    "Please lock in and improve your war activity.",
  ].filter(Boolean).join("\n");
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

function getInitialAdminSection(): AdminSection {
  if (typeof window === "undefined") return "overview";
  const requested = new URLSearchParams(window.location.search).get("section");
  return isAdminSection(requested) ? requested : "overview";
}

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<AdminSection>(getInitialAdminSection);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [invites, setInvites] = useState<InviteEvent[]>([]);
  const [inviteLeaderboard, setInviteLeaderboard] = useState<UnknownRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketMetrics, setTicketMetrics] = useState<UnknownRecord>({});
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
      const [statusRes, playersRes, giveawaysRes, invitesRes, ticketsRes, logsRes, channelsRes, rolesRes] = await Promise.all([
        fetch("/api/admin/status", { cache: "no-store" }),
        fetch("/api/admin/players", { cache: "no-store" }),
        fetch("/api/admin/giveaways", { cache: "no-store" }),
        fetch("/api/admin/invites", { cache: "no-store" }),
        fetch("/api/admin/tickets", { cache: "no-store" }),
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
      if (ticketsRes.ok) {
        const data = (await ticketsRes.json().catch(() => ({}))) as UnknownRecord;
        setTickets(asArray<TicketRow>(data.tickets));
        setTicketMetrics(isRecord(data.metrics) ? data.metrics : {});
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
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("section");
    if (!isAdminSection(requested)) return;
    if (!visibleSections.some((item) => item.id === requested)) return;
    setSection(requested);
  }, [visibleSections]);

  function selectSection(nextSection: AdminSection) {
    setSection(nextSection);
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("section", nextSection);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function handleTourSection(event: Event) {
      const detail = (event as CustomEvent<{ section?: string }>).detail;
      const requested = detail?.section ?? null;
      if (!isAdminSection(requested)) return;
      if (!visibleSections.some((item) => item.id === requested)) return;
      setSection(requested);
    }

    window.addEventListener("mcwv-admin-section", handleTourSection);
    return () => window.removeEventListener("mcwv-admin-section", handleTourSection);
  }, [visibleSections]);

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

  if (!authLoaded || (loading && !status)) {
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
        <div className={`mx-auto flex flex-col gap-6 ${section === "tickets" ? "max-w-[94rem]" : "max-w-7xl lg:flex-row"}`}>
          {section !== "tickets" && (
          <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:w-64 lg:shrink-0">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
              <div className="admin-stripe pointer-events-none absolute inset-x-0 top-0 h-px" />
              <div className="px-3 py-4">
                <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">Admin</div>
                <h1 className="mt-1 text-2xl font-bold">Control Panel</h1>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-full border text-xs font-black"
                    style={{
                      borderColor: "color-mix(in srgb, var(--primary) 45%, transparent)",
                      background: "color-mix(in srgb, var(--primary) 16%, transparent)",
                      color: "var(--foreground)",
                    }}
                  >
                    {String(currentUser.username ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate text-xs text-zinc-400">{currentUser.username}</span>
                  <span
                    className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                      currentUser.role === "owner"
                        ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-200"
                        : "border-sky-400/40 bg-sky-400/10 text-sky-200"
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </div>
              </div>
              <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
                {visibleSections.map((item) => {
                  const active = section === item.id;
                  const ticketBadge =
                    item.id === "tickets" ? pickRecordNumber(ticketMetrics, ["open"], 0) : 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSection(item.id)}
                      className="relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl px-3 py-3 text-left text-sm transition-all duration-300 hover:translate-x-1 hover:bg-white/10 active:scale-[0.98] lg:whitespace-normal"
                      style={{
                        background: active
                          ? "linear-gradient(90deg, color-mix(in srgb, var(--primary) 18%, transparent), rgba(255,255,255,0.06))"
                          : "transparent",
                        border: `1px solid ${active ? "color-mix(in srgb, var(--primary) 35%, var(--border))" : "transparent"}`,
                        boxShadow: active ? "0 0 18px var(--glow)" : "none",
                      }}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full lg:block"
                          style={{ background: "var(--primary)", boxShadow: "0 0 12px var(--glow)" }}
                        />
                      )}
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm"
                        style={{
                          borderColor: active ? "color-mix(in srgb, var(--primary) 40%, transparent)" : "var(--border)",
                          background: active ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "rgba(255,255,255,0.04)",
                        }}
                      >
                        {item.icon}
                      </span>
                      <span style={{ color: active ? "var(--accent)" : "var(--foreground)" }}>{item.label}</span>
                      {ticketBadge > 0 && (
                        <span className="ml-auto rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                          {ticketBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
          )}

          <section key={section} className="admin-section-in min-w-0 flex-1 space-y-6">
            {section !== "tickets" && (
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
              <div className="admin-stripe pointer-events-none absolute inset-x-0 top-0 h-px" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">MCWV Hub</div>
                  <h2 className="mt-1 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
                    <span
                      className="grid h-11 w-11 place-items-center rounded-2xl border text-xl"
                      style={{
                        borderColor: "color-mix(in srgb, var(--primary) 40%, var(--border))",
                        background: "color-mix(in srgb, var(--primary) 14%, transparent)",
                        boxShadow: "0 0 18px var(--glow)",
                      }}
                    >
                      {activeSection.icon}
                    </span>
                    {activeSection.label}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                    {SECTION_DESCRIPTIONS[activeSection.id]}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {status?.loadedAt && (
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      <span className="live-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Updated {formatRelativeTime(status.loadedAt, undefined)}
                    </span>
                  )}
                  <button className="admin-button" type="button" onClick={loadAdminData} disabled={loading}>
                    <span className={loading ? "mr-1 inline-block animate-spin" : "mr-1 inline-block"}>⟳</span>
                    {loading ? "Refreshing…" : "Refresh"}
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
                <div className="admin-section-in mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
                  {actionStatus}
                </div>
              )}
            </div>
            )}

            {section === "overview" && (
              <OverviewSection
                cards={cards}
                loadedAt={status?.loadedAt}
                recentActivity={recentActivity}
                onAction={postAction}
              />
            )}

            {section === "bot" && <BotSection bot={bot} channels={channels} onAction={postAction} />}

            {section === "activity" && <ActivitySection />}

            {section === "broadcast" && (
              <BroadcastSection
                roles={roles}
                isOwner={isOwner}
                onToast={(message, tone) => showToast(message, tone)}
              />
            )}

            {section === "events" && (
              <div className="space-y-6">
                <InvitesSection
                  invites={invites}
                  leaderboard={inviteLeaderboard}
                  onStart={startInviteEvent}
                  onAction={postAction}
                />
                <GiveawaysSection
                  giveaways={giveaways}
                  onCreate={createGiveaway}
                  onAction={postAction}
                />
              </div>
            )}

            {section === "tickets" && (
              <TicketsSection tickets={tickets} metrics={ticketMetrics} channels={channels} isOwner={isOwner} onToast={showToast} onReload={loadAdminData} />
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
          position: relative;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
          border-radius: 999px;
          background: color-mix(in srgb, var(--primary) 13%, transparent);
          padding: 0.55rem 0.9rem;
          color: var(--foreground);
          font-size: 0.85rem;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .admin-button::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: -70%;
          width: 45%;
          background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.16), transparent);
          transform: skewX(-20deg);
          transition: left 0.6s ease;
          pointer-events: none;
        }
        .admin-button:hover:not(:disabled) {
          background: color-mix(in srgb, var(--primary) 22%, transparent);
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
          transform: translateY(-1px);
          box-shadow: 0 6px 22px color-mix(in srgb, var(--primary) 22%, transparent);
        }
        .admin-button:hover:not(:disabled)::after {
          left: 125%;
        }
        .admin-button:active:not(:disabled) {
          transform: scale(0.96);
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
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .admin-input:hover:not(:focus) {
          border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
        }
        .admin-input:focus {
          border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent), 0 0 18px var(--glow);
        }
        .admin-input::placeholder {
          color: color-mix(in srgb, var(--foreground) 35%, transparent);
        }
        .admin-label {
          color: color-mix(in srgb, var(--foreground) 55%, transparent);
        }
        .admin-button-danger {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(248, 113, 113, 0.35);
          border-radius: 999px;
          background: rgba(248, 113, 113, 0.12);
          padding: 0.55rem 0.9rem;
          color: rgb(252, 165, 165);
          font-size: 0.85rem;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .admin-button-danger:hover {
          background: rgba(248, 113, 113, 0.2);
          border-color: rgba(248, 113, 113, 0.55);
          transform: translateY(-1px);
          box-shadow: 0 6px 22px rgba(248, 113, 113, 0.18);
        }
        .admin-button-danger:active {
          transform: scale(0.96);
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
        className="admin-modal-backdrop-in absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        className="animate-scale-in relative z-10 w-full max-w-xl rounded-3xl border p-5 shadow-2xl sm:p-6"
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
    <div className={`admin-toast-in fixed bottom-5 right-5 z-[90] flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toneClass}`}>
      <span className="text-base">{tone === "success" ? "✅" : tone === "error" ? "⚠️" : "ℹ️"}</span>
      <span>{message}</span>
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
    <section className="card-hover rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
          <span
            className="inline-block h-3.5 w-1 rounded-full"
            style={{ background: "var(--primary)", boxShadow: "0 0 10px var(--glow)" }}
          />
          {title}
        </h3>
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
              className="shine-sweep stagger-in rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white/10"
              style={{ "--i": index } as CSSProperties}
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

function ActivitySection() {
  const [threshold, setThreshold] = useState(100);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"needs" | "low" | "zero" | "offline" | "disconnects" | "improvers">("needs");
  const [copyStatus, setCopyStatus] = useState("");

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/activity?threshold=${encodeURIComponent(String(threshold))}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ActivityData | null;
      setData(json?.success ? json : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const rows = activeTab === "needs"
    ? data?.needsAttention ?? []
    : activeTab === "low"
    ? data?.lowPph ?? []
    : activeTab === "zero"
    ? data?.zeroPoints ?? []
    : activeTab === "offline"
    ? data?.offline ?? []
    : activeTab === "disconnects"
    ? data?.disconnects ?? []
    : data?.topImprovers ?? [];

  const tabs: Array<[typeof activeTab, string, number]> = [
    ["needs", "Needs Attention", data?.summary.needsAttention ?? 0],
    ["low", "Low PPH", data?.summary.lowPph ?? 0],
    ["zero", "Zero Points", data?.summary.zeroPoints ?? 0],
    ["offline", "Offline", data?.summary.offline ?? 0],
    ["disconnects", "Disconnects", data?.summary.disconnectWatch ?? 0],
    ["improvers", "Top Improvers", data?.topImprovers.length ?? 0],
  ];

  const activeLabel = tabs.find(([id]) => id === activeTab)?.[1] ?? "Activity";
  const pingableRows = rows.filter((row) => row.discordId);

  async function copyMentions() {
    const text = uniqueDiscordMentions(pingableRows).join(" ");
    const ok = await copyToClipboard(text);
    setCopyStatus(ok ? `Copied ${uniqueDiscordMentions(pingableRows).length} mention(s).` : "No linked Discord users to copy.");
    window.setTimeout(() => setCopyStatus(""), 2500);
  }

  async function copyMessage() {
    const text = buildActivityCopyMessage(pingableRows, activeLabel, threshold);
    const ok = await copyToClipboard(text);
    setCopyStatus(ok ? "Copied activity message." : "No linked Discord users to copy.");
    window.setTimeout(() => setCopyStatus(""), 2500);
  }

  async function copyUsernames() {
    const text = rows.map((row) => row.username).join("\n");
    const ok = await copyToClipboard(text);
    setCopyStatus(ok ? `Copied ${rows.length} username(s).` : "No users to copy.");
    window.setTimeout(() => setCopyStatus(""), 2500);
  }

  return (
    <div className="space-y-6">
      <Panel title="War Monitor">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm leading-6 text-zinc-400">
              Strict live staff view. PPH only appears when a true 60-minute window exists.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Battle: <span className="font-mono text-zinc-300">{data?.battleId ?? "—"}</span>
              {data?.updatedAt ? ` · Updated ${formatTime(data.updatedAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Low PPH threshold</span>
              <input
                className="admin-input w-36"
                type="number"
                min={0}
                value={threshold}
                onChange={(event) => setThreshold(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
            <button className="admin-button" type="button" onClick={() => void loadActivity()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MiniStat label="Roster" value={String(data?.summary.roster ?? "—")} />
          <MiniStat label="Needs Attention" value={String(data?.summary.needsAttention ?? "—")} />
          <MiniStat label="Low PPH" value={String(data?.summary.lowPph ?? "—")} />
          <MiniStat label="Zero Points" value={String(data?.summary.zeroPoints ?? "—")} />
          <MiniStat label="Offline" value={String(data?.summary.offline ?? "—")} />
          <MiniStat label="Disconnect Watch" value={String(data?.summary.disconnectWatch ?? "—")} />
        </div>
      </Panel>

      <Panel title="Attention Lists">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs transition ${activeTab === id ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/10"}`}
              onClick={() => setActiveTab(id)}
            >
              {label} · {count}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <button className="admin-button" type="button" onClick={() => void copyMentions()} disabled={!pingableRows.length}>
            Copy mentions
          </button>
          <button className="admin-button" type="button" onClick={() => void copyMessage()} disabled={!pingableRows.length || activeTab === "improvers"}>
            Copy warning message
          </button>
          <button className="admin-button" type="button" onClick={() => void copyUsernames()} disabled={!rows.length}>
            Copy usernames
          </button>
          <span className="text-xs text-zinc-500">
            {pingableRows.length} linked Discord user(s) in {activeLabel.toLowerCase()}
          </span>
          {copyStatus && <span className="text-xs text-emerald-300">{copyStatus}</span>}
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
            <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
          </div>
        ) : !data ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">Failed to load activity data.</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nothing in this list right now.</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {rows.map((member) => <ActivityMemberCard key={`${activeTab}-${member.robloxId}`} member={member} threshold={threshold} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ActivityMemberCard({ member, threshold }: { member: ActivityMember; threshold: number }) {
  const statusToneClass = member.statusTone === "ingame"
    ? "text-emerald-200 border-emerald-400/25 bg-emerald-400/10"
    : member.statusTone === "offline"
    ? "text-red-200 border-red-400/25 bg-red-400/10"
    : "text-zinc-200 border-white/10 bg-white/5";

  return (
    <div
      className="card-hover rounded-2xl border border-white/10 bg-black/20 p-4"
      style={{
        borderLeft: `3px solid ${
          member.statusTone === "ingame" ? "rgba(52,211,153,0.55)" : member.statusTone === "offline" ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.12)"
        }`,
      }}
    >
      <div className="flex items-start gap-3">
        <img className="h-12 w-12 rounded-2xl border border-white/10 bg-black/30 transition duration-300 hover:scale-105" src={member.avatarUrl ?? `/api/roblox/avatar?userId=${member.robloxId}`} alt="" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-white">{member.username}</p>
            {member.isAlt && <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">ALT</span>}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusToneClass}`}>
              {member.statusTone === "ingame" && <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              {member.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {member.isAlt && member.ownerUsername ? `Alt of ${member.ownerUsername}` : member.discordId ? `Discord linked` : "No Discord link"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
        <MiniStat label="Points" value={formatCompact(member.points)} />
        <MiniStat label="PPH" value={member.pphReady ? formatCompact(member.pph) : "—"} />
        <MiniStat label="5m" value={member.change5m > 0 ? `+${formatCompact(member.change5m)}` : "—"} />
        <MiniStat label="Disconnects" value={String(member.disconnects24h)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {member.reasons.length ? member.reasons.map((reason) => (
          <span key={reason} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100">{reason}</span>
        )) : (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-100">Above {threshold} PPH</span>
        )}
      </div>
    </div>
  );
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}


function BotSection({
  bot,
  channels,
  onAction,
}: {
  bot: UnknownRecord | undefined;
  channels: AdminChannel[];
  onAction: AdminAction;
}) {
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

      <BotAutomationPanel bot={bot} channels={channels} onAction={onAction} />

      <Panel title="Background Loops">
        <div className="grid gap-3 sm:grid-cols-2">
          {loopRows.map(([name, value], index) => {
            const text = isRecord(value) ? readString(value, ["status", "state"], "Unknown") : String(value ?? "Unknown");
            return (
              <div key={safeId("loop", name, index)} className="row-lift flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
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

function savedChannelId(value: unknown) {
  const text = valueToString(value, "") ?? "";
  return text && text !== "0" ? text : "";
}

function BotAutomationPanel({
  bot,
  channels,
  onAction,
}: {
  bot: UnknownRecord | undefined;
  channels: AdminChannel[];
  onAction: AdminAction;
}) {
  const sendableChannels = channels.filter((channel) => channel.canSendMessages || channel.usableForGiveaways);
  const [placementChannel, setPlacementChannel] = useState("");
  const [clanLogChannel, setClanLogChannel] = useState("");
  const [hourlyChannel, setHourlyChannel] = useState("");
  const [hourlyPingEnabled, setHourlyPingEnabled] = useState(false);
  const [hourlyPingThreshold, setHourlyPingThreshold] = useState(100);
  const [hourlyStartTime, setHourlyStartTime] = useState("");
  const [hourlyPingMessage, setHourlyPingMessage] = useState("");

  const savedPlacement = savedChannelId(bot?.placementChannel);
  const savedClanLog = savedChannelId(bot?.clanLogChannel);
  const savedHourly = savedChannelId(bot?.hourlyStatsChannel);
  const savedHourlyPingEnabled = bot?.hourlyStatsPingEnabled === true;
  const savedHourlyPingThreshold = readNumber(bot, ["hourlyStatsPingThreshold"], 100);
  const savedHourlyStartTime = readString(bot, ["hourlyStatsStartTime"], "");
  const savedHourlyPingMessage = readString(bot, ["hourlyStatsPingMessage"], "");

  useEffect(() => {
    setPlacementChannel(savedPlacement);
  }, [savedPlacement]);

  useEffect(() => {
    setClanLogChannel(savedClanLog);
  }, [savedClanLog]);

  useEffect(() => {
    setHourlyChannel(savedHourly);
  }, [savedHourly]);

  useEffect(() => {
    setHourlyPingEnabled(savedHourlyPingEnabled);
  }, [savedHourlyPingEnabled]);

  useEffect(() => {
    setHourlyPingThreshold(savedHourlyPingThreshold);
  }, [savedHourlyPingThreshold]);

  useEffect(() => {
    setHourlyStartTime(savedHourlyStartTime === "—" ? "" : savedHourlyStartTime);
  }, [savedHourlyStartTime]);

  useEffect(() => {
    setHourlyPingMessage(savedHourlyPingMessage === "—" ? "" : savedHourlyPingMessage);
  }, [savedHourlyPingMessage]);

  const hourlyInterval = readString(bot, ["hourlyStatsIntervalMinutes"], "60");
  const hourlyLastSent = readString(bot, ["hourlyStatsLastSentAt"], "Never");

  async function configure(
    system: "placement_alerts" | "clan_logs" | "hourly_stats",
    channelId: string,
    extra: UnknownRecord = {}
  ) {
    const parsed = parseDiscordChannelInput(channelId) ?? channelId.trim();
    await onAction("/api/admin/sync", { target: "setup", system, channel_id: parsed, ...extra });
  }

  async function toggleSystem(
    system: "placement_alerts" | "clan_logs" | "hourly_stats",
    enabled: boolean
  ) {
    await onAction("/api/admin/sync", { target: "setup", system, enabled });
  }

  const placementEnabled = readString(bot, ["placementAlertsEnabled"], "No") === "Yes";
  const clanLogsEnabled = readString(bot, ["clanLogsEnabled"], "No") === "Yes";
  const hourlyEnabled = readString(bot, ["hourlyStatsEnabled"], "No") === "Yes";

  async function sendHourlyNow(channelId: string) {
    const parsed = parseDiscordChannelInput(channelId) ?? channelId.trim();
    await onAction("/api/admin/sync", {
      target: "hourly_stats_send",
      ...(parsed ? { channel_id: parsed } : {}),
      ping_enabled: hourlyPingEnabled,
      ping_threshold: hourlyPingThreshold,
      ping_message: hourlyPingMessage,
    });
  }

  return (
    <Panel title="Bot Automation">
      <div className="grid gap-4 xl:grid-cols-3">
        <BotAutomationCard
          title="Placement Alerts"
          icon="📈"
          description="Post MCWV placement cards when clan rank changes during active wars."
          enabled={readString(bot, ["placementAlertsEnabled"], "No")}
          savedChannel={savedPlacement}
          channelValue={placementChannel}
          onChannelChange={setPlacementChannel}
          channels={sendableChannels}
          onConfigure={() => configure("placement_alerts", placementChannel)}
          onToggle={() => toggleSystem("placement_alerts", !placementEnabled)}
          toggleDisabled={false}
        />
        <BotAutomationCard
          title="Clan Logs"
          icon="📜"
          description="Post member joins, member leaves, and diamond donation logs."
          enabled={readString(bot, ["clanLogsEnabled"], "No")}
          savedChannel={savedClanLog}
          channelValue={clanLogChannel}
          onChannelChange={setClanLogChannel}
          channels={sendableChannels}
          onConfigure={() => configure("clan_logs", clanLogChannel)}
          onToggle={() => toggleSystem("clan_logs", !clanLogsEnabled)}
          toggleDisabled={false}
        />
        <BotAutomationCard
          title="Hourly Stats"
          icon="⏱"
          description={`Auto-post the hourly points image every ${hourlyInterval} minutes.`}
          enabled={readString(bot, ["hourlyStatsEnabled"], "No")}
          savedChannel={savedHourly}
          channelValue={hourlyChannel}
          onChannelChange={setHourlyChannel}
          channels={sendableChannels}
          footer={`Last sent: ${formatTime(hourlyLastSent)} · Auto-pauses when no clan war is active`}
          onConfigure={() => configure("hourly_stats", hourlyChannel, {
            ping_enabled: hourlyPingEnabled,
            ping_threshold: hourlyPingThreshold,
            start_time: hourlyStartTime,
            ping_message: hourlyPingMessage,
          })}
          onToggle={() => toggleSystem("hourly_stats", !hourlyEnabled)}
          toggleDisabled={!savedHourly && !hourlyEnabled}
          toggleDisabledHint="Set a channel first, then you can enable it."
          onSecondary={() => sendHourlyNow(hourlyChannel)}
          secondaryLabel="Send now"
        >
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={hourlyPingEnabled}
                onChange={(event) => setHourlyPingEnabled(event.target.checked)}
              />
              Send follow-up pings under threshold
            </label>
            <label className="mt-3 block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">PPH Threshold</span>
              <input
                type="number"
                min={0}
                className="admin-input"
                value={hourlyPingThreshold}
                onChange={(event) => setHourlyPingThreshold(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
            <label className="mt-3 block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Auto-post start time UTC</span>
              <input
                type="time"
                className="admin-input"
                value={hourlyStartTime}
                onChange={(event) => setHourlyStartTime(event.target.value)}
              />
            </label>
            <label className="mt-3 block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Follow-up message</span>
              <textarea
                className="admin-input min-h-28"
                value={hourlyPingMessage}
                onChange={(event) => setHourlyPingMessage(event.target.value)}
                placeholder="Message below the pings. Variables: {threshold}, {count}"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Example: 100 pings linked Discord users below 100 PPH after the image. Variables: {"{threshold}"}, {"{count}"}.
            </p>
          </div>
        </BotAutomationCard>
      </div>
    </Panel>
  );
}

function BotAutomationCard({
  title,
  icon,
  description,
  enabled,
  savedChannel,
  channelValue,
  onChannelChange,
  channels,
  footer,
  onConfigure,
  onToggle,
  toggleDisabled,
  toggleDisabledHint,
  onSecondary,
  secondaryLabel,
  children,
}: {
  title: string;
  icon: string;
  description: string;
  enabled: string;
  savedChannel: string;
  channelValue: string;
  onChannelChange: (value: string) => void;
  channels: AdminChannel[];
  footer?: string;
  onConfigure: () => void | Promise<void>;
  onToggle?: () => void | Promise<void>;
  toggleDisabled?: boolean;
  toggleDisabledHint?: string;
  onSecondary?: () => void | Promise<void>;
  secondaryLabel?: string;
  children?: ReactNode;
}) {
  const savedChannelLabel = channels.find((channel) => channel.id === savedChannel);
  const status = enabled === "Yes" ? "Enabled" : "Disabled";
  const isEnabled = enabled === "Yes";

  return (
    <div className="glow-spin rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold">
            <span>{icon}</span>
            <span>{title}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${statusTone(status)}`}>{status}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-400">
        <span className="font-semibold uppercase tracking-[0.2em] text-zinc-500">Current Channel</span>
        <div className="mt-1 font-mono text-zinc-200">
          {savedChannelLabel ? channelDisplayName(savedChannelLabel) : savedChannel || "Not configured"}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Set Channel</label>
        {channels.length > 0 && (
          <select
            className="admin-input"
            value={channelValue}
            onChange={(event) => onChannelChange(event.target.value)}
          >
            <option value="">Select a channel...</option>
            {channels.map((channel) => (
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
          value={channelValue}
          onChange={(event) => onChannelChange(event.target.value)}
        />
      </div>

      {children}

      {footer && <p className="mt-3 text-xs text-zinc-500">{footer}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="admin-button" type="button" onClick={() => void onConfigure()}>
          Save settings
        </button>
        {onToggle && (
          <button
            className={`admin-button ${
              isEnabled
                ? "border-red-400/40 text-red-300 hover:bg-red-500/10"
                : "border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10"
            }`}
            type="button"
            disabled={Boolean(toggleDisabled)}
            title={toggleDisabled ? toggleDisabledHint ?? "Not available yet" : undefined}
            onClick={() => void onToggle()}
          >
            {isEnabled ? "Disable" : "Enable"}
          </button>
        )}
        {onSecondary && (
          <button className="admin-button" type="button" onClick={() => void onSecondary()}>
            {secondaryLabel ?? "Run"}
          </button>
        )}
      </div>
    </div>
  );
}

function BroadcastSection({
  roles,
  isOwner,
  onToast,
}: {
  roles: AdminRoleOption[];
  isOwner: boolean;
  onToast: (message: string, tone: "success" | "error" | "info") => void;
}) {
  const [audience, setAudience] = useState("everyone");
  const [delivery, setDelivery] = useState("dm");
  const [style, setStyle] = useState("plain");
  const [value, setValue] = useState("");
  const [roleId, setRoleId] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [allowedUserIds, setAllowedUserIds] = useState("");
  const [allowedStatus, setAllowedStatus] = useState("");
  const [allowedLoading, setAllowedLoading] = useState(false);
  const [tab, setTab] = useState<BroadcastTab>("send");
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [schedules, setSchedules] = useState<BroadcastSchedule[]>([]);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [templatePickerId, setTemplatePickerId] = useState("");
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

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
      image_url: imageUrl.trim(),
    }),
    [audience, delivery, imageUrl, message, roleId, style, value]
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

  async function loadAllowedUsers() {
    if (!isOwner) return;
    setAllowedLoading(true);
    setAllowedStatus("Loading allowed users...");
    try {
      const res = await fetch("/api/admin/broadcast/allowed-users", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to load allowed users"));
      const ids = Array.isArray(data.user_ids) ? data.user_ids.map(String) : [];
      setAllowedUserIds(ids.join(", "));
      setAllowedStatus("Allowed users loaded.");
    } catch (err) {
      setAllowedStatus(err instanceof Error ? err.message : "Failed to load allowed users");
    } finally {
      setAllowedLoading(false);
      window.setTimeout(() => setAllowedStatus(""), 1800);
    }
  }

  async function saveAllowedUsers() {
    if (!isOwner) return;
    setAllowedLoading(true);
    setAllowedStatus("Saving allowed users...");
    try {
      const ids = allowedUserIds.match(/\d{15,25}/g) ?? [];
      const res = await fetch("/api/admin/broadcast/allowed-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save allowed users"));
      const saved = Array.isArray(data.user_ids) ? data.user_ids.map(String) : ids;
      setAllowedUserIds(saved.join(", "));
      setAllowedStatus("Allowed broadcast users saved.");
      onToast("Allowed broadcast users saved", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save allowed users";
      setAllowedStatus(msg);
      onToast(msg, "error");
    } finally {
      setAllowedLoading(false);
      window.setTimeout(() => setAllowedStatus(""), 2200);
    }
  }

  useEffect(() => {
    void loadAllowedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  async function loadBroadcastMeta() {
    setMetaLoading(true);
    let missing = false;
    try {
      const [templatesRes, schedulesRes] = await Promise.all([
        fetch("/api/admin/broadcast/templates", { cache: "no-store" }),
        fetch("/api/admin/broadcast/schedules", { cache: "no-store" }),
      ]);
      const templatesData = (await templatesRes.json().catch(() => ({}))) as UnknownRecord;
      const schedulesData = (await schedulesRes.json().catch(() => ({}))) as UnknownRecord;

      if (broadcastTableMissingFrom(templatesData) || broadcastTableMissingFrom(schedulesData)) {
        missing = true;
      } else {
        if (templatesRes.ok) setTemplates(asArray<BroadcastTemplate>(templatesData.templates));
        if (schedulesRes.ok) setSchedules(asArray<BroadcastSchedule>(schedulesData.schedules));
      }
    } catch {
      // Tables may not exist yet — the Send tab keeps working regardless.
    } finally {
      setTablesMissing(missing);
      setMetaLoading(false);
    }
  }

  useEffect(() => {
    void loadBroadcastMeta();
  }, []);

  function applyToComposer(source: {
    audience?: string | null;
    value?: string | null;
    delivery?: string | null;
    style?: string | null;
    message?: string | null;
    imageUrl?: string | null;
    image_url?: string | null;
  }) {
    const allowedAudiences = new Set([
      "everyone",
      "below_points",
      "above_points",
      "zero_points",
      "bottom_n",
      "top_n",
      "members",
      "officers",
      "discord_role",
      "custom_user",
    ]);
    if (source.audience && allowedAudiences.has(source.audience)) setAudience(source.audience);
    if (source.delivery === "dm" || source.delivery === "ticket") setDelivery(source.delivery);
    if (source.style === "plain" || source.style === "embed") setStyle(source.style);
    setValue(source.value ?? "");
    setMessage(source.message ?? "");
    setImageUrl(source.imageUrl ?? source.image_url ?? "");
    setPreview(null);
    setTemplateSaveOpen(false);
    setTab("send");
  }

  function handleTemplatePicker(templateId: string) {
    setTemplatePickerId(templateId);
    if (!templateId) return;
    const template = templates.find((item) => String(item.id) === templateId);
    if (template) applyToComposer(template);
  }

  async function saveComposerAsTemplate() {
    const name = templateSaveName.trim();
    if (!name) {
      onToast("Give the template a name.", "error");
      return;
    }
    if (!message.trim()) {
      onToast("Message is required.", "error");
      return;
    }

    setTemplateSaving(true);
    try {
      const res = await fetch("/api/admin/broadcast/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, audience, delivery, style, value, message, imageUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save template"));
      onToast(`Template "${name}" saved`, "success");
      setTemplateSaveName("");
      setTemplateSaveOpen(false);
      void loadBroadcastMeta();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save template", "error");
    } finally {
      setTemplateSaving(false);
    }
  }

  const missingTablesNotice = (
    <Panel title="Bot Restart Needed" right={<span className="text-xs text-zinc-500">🤖</span>}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-400">
          The bot creates the new broadcast tables when it boots. Upload the latest{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">main.py</code> on Render, restart the
          bot, then retry.
        </p>
        <button className="admin-button" type="button" disabled={metaLoading} onClick={() => void loadBroadcastMeta()}>
          {metaLoading ? "Checking..." : "↻ Retry"}
        </button>
      </div>
    </Panel>
  );

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
    <div className="space-y-6">
      {isOwner && (
          <Panel title="Broadcast Command Access" right={<span className="text-xs text-zinc-500">Owner only</span>}>
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Add Discord user IDs here to allow specific people to use /broadcast and the website broadcast tools, without relying only on role IDs.
              </p>
              <textarea
                className="admin-input min-h-24 resize-y"
                value={allowedUserIds}
                onChange={(event) => setAllowedUserIds(event.target.value)}
                placeholder="1225521918984061041, 123456789012345678"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">Paste Discord IDs or mentions. They will be saved as a hardcoded allow-list in the bot settings.</p>
                <div className="flex gap-2">
                  <button className="admin-button" type="button" disabled={allowedLoading} onClick={() => void loadAllowedUsers()}>Reload</button>
                  <button className="admin-button" type="button" disabled={allowedLoading} onClick={() => void saveAllowedUsers()}>Save Allowed Users</button>
                </div>
              </div>
              {allowedStatus && <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">{allowedStatus}</div>}
            </div>
          </Panel>
      )}

      <div className="flex flex-wrap gap-2">
        {BROADCAST_TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:brightness-125"
              style={{
                background: active
                  ? "linear-gradient(90deg, color-mix(in srgb, var(--primary) 22%, transparent), rgba(255,255,255,0.06))"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "color-mix(in srgb, var(--primary) 45%, var(--border))" : "var(--border)"}`,
                boxShadow: active ? "0 0 16px var(--glow)" : "none",
                color: active ? "var(--accent)" : "var(--foreground)",
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "send" && (
      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
      <Panel title="Create Broadcast">
        <div className="space-y-4">
          {templates.length > 0 && (
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Load a Template</span>
              <select
                className="admin-input"
                value={templatePickerId}
                onChange={(event) => handleTemplatePicker(event.target.value)}
              >
                <option value="">Start from a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={String(template.id)}>{template.name}</option>
                ))}
              </select>
              <span className="admin-label text-xs">
                Manage templates in the 📄 Templates tab. Discord-role templates still need a role picked below.
              </span>
            </label>
          )}
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
              placeholder="Clan war starts soon, {ping}. Please prepare, {username}."
            />
            <span className="admin-label text-xs">Placeholders: {"{ping}"}, {"{username}"}, {"{points}"}, {"{pph}"}, {"{change5m}"}, {"{rank}"}, {"{clan_rank}"}, {"{war_time_left}"}, {"{next_player}"}, {"{next_rank_gap}"}, {"{roblox_id}"}, {"{discord_id}"}, {"{role}"}, {"{ticket}"}</span>
          </label>

          <div className="space-y-2">
            <LabeledInput
              label="🖼️ Image URL (optional)"
              value={imageUrl}
              onChange={(next) => { setImageUrl(next); setPreview(null); }}
              placeholder="https://… direct image link (Discord CDN, imgur…)"
            />
            {imageUrl.trim() ? (
              <img
                key={imageUrl.trim()}
                src={imageUrl.trim()}
                alt="Broadcast artwork preview"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                className="max-h-40 rounded-2xl border border-white/10 object-cover"
              />
            ) : null}
            <span className="admin-label text-xs">
              Shows inside embed broadcasts, attaches under plain ones, and becomes the artwork on the app push + inbox copy.
            </span>
          </div>

          {status && (
            <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              {status}
            </div>
          )}

          {templateSaveOpen && (
            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <LabeledInput
                  label="Template Name"
                  value={templateSaveName}
                  onChange={setTemplateSaveName}
                  placeholder="e.g. Final 24h warning"
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="admin-button"
                  type="button"
                  disabled={templateSaving}
                  onClick={() => void saveComposerAsTemplate()}
                >
                  {templateSaving ? "Saving..." : "💾 Save Template"}
                </button>
                <button className="admin-button" type="button" onClick={() => setTemplateSaveOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="admin-button"
              type="button"
              disabled={loading || !message.trim()}
              onClick={() => setTemplateSaveOpen((open) => !open)}
              title="Save this exact setup as a reusable template"
            >
              Save as Template
            </button>
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
                className="rounded-2xl border p-4 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }}
              >
                {style === "embed" && <div className="mb-2 font-semibold">📢 MCWV Broadcast</div>}
                {/* Renders Discord formatting exactly like the DMs will */}
                <DiscordMarkdown
                  text={renderBroadcastPreviewMessage(message, preview.sampleRecipients[0])}
                />
                {imageUrl.trim() ? (
                  <img
                    key={imageUrl.trim()}
                    src={imageUrl.trim()}
                    alt="Broadcast artwork"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                    className="mt-3 max-h-48 w-full rounded-xl border border-white/10 object-cover"
                  />
                ) : null}
              </div>
            </div>

            <div>
              <div className="admin-label mb-2 text-xs uppercase tracking-[0.2em]">Sample Recipients</div>
              <div className="space-y-2">
                {preview.sampleRecipients.length ? (
                  preview.sampleRecipients.map((recipient, index) => (
                    <div key={safeId("broadcast-sample", recipient.discord_id, index)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                      <div className="font-medium">{recipient.username ?? "Unknown"}</div>
                      <div className="text-xs text-zinc-500">{recipient.points ?? 0} pts · {recipient.pph ?? 0} last hour · rank {recipient.rank ?? "—"}</div>
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
      )}

      {tab === "templates" &&
        (tablesMissing ? (
          missingTablesNotice
        ) : (
          <BroadcastTemplatesPanel
            templates={templates}
            loading={metaLoading}
            onRefresh={() => void loadBroadcastMeta()}
            onToast={onToast}
            onLoad={applyToComposer}
          />
        ))}

      {tab === "schedules" &&
        (tablesMissing ? (
          missingTablesNotice
        ) : (
          <BroadcastSchedulesPanel
            schedules={schedules}
            loading={metaLoading}
            onRefresh={() => void loadBroadcastMeta()}
            onToast={onToast}
          />
        ))}

      {tab === "history" && <BroadcastHistoryPanel onToast={onToast} onReuse={applyToComposer} />}
    </div>
  );
}

function BroadcastTemplatesPanel({
  templates,
  loading,
  onRefresh,
  onToast,
  onLoad,
}: {
  templates: BroadcastTemplate[];
  loading: boolean;
  onRefresh: () => void;
  onToast: (message: string, tone: "success" | "error" | "info") => void;
  onLoad: (template: BroadcastTemplate) => void;
}) {
  const [editing, setEditing] = useState<BroadcastTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState("everyone");
  const [value, setValue] = useState("");
  const [delivery, setDelivery] = useState("dm");
  const [style, setStyle] = useState("plain");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const openEditor = creating || editing !== null;
  const needsValue = ["below_points", "above_points", "bottom_n", "top_n", "custom_user"].includes(audience);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setName("");
    setAudience("everyone");
    setValue("");
    setDelivery("dm");
    setStyle("plain");
    setMessage("");
    setImageUrl("");
  }

  function startEdit(template: BroadcastTemplate) {
    setCreating(false);
    setEditing(template);
    setName(template.name);
    setAudience(template.audience);
    setValue(template.value);
    setDelivery(template.delivery);
    setStyle(template.style);
    setMessage(template.message);
    setImageUrl(template.imageUrl ?? "");
  }

  function closeEditor() {
    setEditing(null);
    setCreating(false);
  }

  async function saveTemplate() {
    if (!name.trim()) return onToast("Template name is required.", "error");
    if (!message.trim()) return onToast("Message is required.", "error");
    if (needsValue && !value.trim()) return onToast("This audience needs a value.", "error");

    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/broadcast/templates/${editing.id}` : "/api/admin/broadcast/templates",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, audience, value, delivery, style, message, imageUrl }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save template"));
      onToast(editing ? "Template updated" : "Template created", "success");
      closeEditor();
      onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save template", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(template: BroadcastTemplate) {
    if (!confirmAction(`Delete template "${template.name}"? This cannot be undone.`)) return;
    setDeletingId(template.id);
    try {
      const res = await fetch(`/api/admin/broadcast/templates/${template.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to delete template"));
      onToast("Template deleted", "info");
      onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to delete template", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Broadcast Templates"
        right={
          <div className="flex gap-2">
            <button className="admin-button" type="button" disabled={loading} onClick={onRefresh}>
              ↻
            </button>
            <button className="admin-button" type="button" onClick={startCreate}>
              + New Template
            </button>
          </div>
        }
      >
        {openEditor ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput label="Template Name" value={name} onChange={setName} placeholder="e.g. Final 24h warning" />
              <label className="block space-y-2">
                <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Audience</span>
                <select className="admin-input" value={audience} onChange={(event) => setAudience(event.target.value)}>
                  {Object.entries(BROADCAST_AUDIENCE_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Delivery</span>
                <select className="admin-input" value={delivery} onChange={(event) => setDelivery(event.target.value)}>
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
                onChange={setValue}
                placeholder={audience === "custom_user" ? "Paste Discord IDs or mentions" : "Example: 15 or 1000"}
              />
            )}
            {audience === "discord_role" && (
              <p className="text-xs text-zinc-500">
                Heads up: the role itself is picked at send time — this template just remembers the audience type.
              </p>
            )}
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Message</span>
              <textarea
                className="admin-input min-h-32 resize-y"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="War ends in {war_time_left}, {username} — you're on {points} points!"
              />
              <span className="admin-label text-xs">Placeholders: {"{ping}"}, {"{username}"}, {"{points}"}, {"{pph}"}, {"{change5m}"}, {"{rank}"}, {"{clan_rank}"}, {"{war_time_left}"}, {"{next_player}"}, {"{next_rank_gap}"}</span>
            </label>
            <div className="space-y-2">
              <LabeledInput
                label="🖼️ Image URL (optional)"
                value={imageUrl}
                onChange={setImageUrl}
                placeholder="https://… direct image link (Discord CDN, imgur…)"
              />
              {imageUrl.trim() ? (
                <img
                  key={imageUrl.trim()}
                  src={imageUrl.trim()}
                  alt="Template artwork preview"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  className="max-h-36 rounded-2xl border border-white/10 object-cover"
                />
              ) : null}
              <span className="admin-label text-xs">
                Artwork sent with the broadcast — embed image, app push picture, and inbox banner.
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="admin-button" type="button" onClick={closeEditor}>Cancel</button>
              <button className="admin-button" type="button" disabled={saving} onClick={() => void saveTemplate()}>
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        ) : templates.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="card-hover space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{template.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-300">
                        {broadcastAudienceLabel(template.audience, template.value)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-300">
                        {template.delivery === "ticket" ? "Ticket" : "DM"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-300">
                        {template.style}
                      </span>
                      {template.imageUrl ? (
                        <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-[11px] text-violet-200">
                          🖼️ image
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <p
                  className="text-sm text-zinc-400"
                  style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {template.message}
                </p>
                <div className="text-xs text-zinc-500">
                  {template.updatedBy ? `Last edited by ${template.updatedBy}` : "Saved template"}
                  {template.updatedAt ? ` · ${formatTime(template.updatedAt)}` : ""}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="admin-button" type="button" onClick={() => onLoad(template)}>
                    ✉️ Use
                  </button>
                  <button className="admin-button" type="button" onClick={() => startEdit(template)}>
                    Edit
                  </button>
                  <button
                    className="admin-button"
                    type="button"
                    disabled={deletingId === template.id}
                    onClick={() => void deleteTemplate(template)}
                  >
                    {deletingId === template.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              No templates yet. Save your go-to war messages here — or hit &quot;Save as Template&quot; in the Send tab.
            </p>
            <button className="admin-button" type="button" onClick={startCreate}>+ New Template</button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BroadcastSchedulesPanel({
  schedules,
  loading,
  onRefresh,
  onToast,
}: {
  schedules: BroadcastSchedule[];
  loading: boolean;
  onRefresh: () => void;
  onToast: (message: string, tone: "success" | "error" | "info") => void;
}) {
  const [editing, setEditing] = useState<BroadcastSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("one_time");
  const [audience, setAudience] = useState("everyone");
  const [value, setValue] = useState("");
  const [delivery, setDelivery] = useState("dm");
  const [style, setStyle] = useState("plain");
  const [message, setMessage] = useState("");
  const [topN, setTopN] = useState("10");
  const [hours, setHours] = useState("24");
  const [runAtLocal, setRunAtLocal] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const openEditor = creating || editing !== null;
  const needsValue = ["below_points", "above_points", "bottom_n", "top_n"].includes(audience);
  const kindMeta = broadcastScheduleKindMeta(kind);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setName("");
    setKind("one_time");
    setAudience("everyone");
    setValue("");
    setDelivery("dm");
    setStyle("embed");
    setMessage("");
    setTopN("10");
    setHours("24");
    setRunAtLocal("");
    setEnabled(true);
  }

  function startEdit(schedule: BroadcastSchedule) {
    setCreating(false);
    setEditing(schedule);
    setName(schedule.name);
    setKind(schedule.kind);
    setAudience(schedule.audience);
    setValue(schedule.value);
    setDelivery(schedule.delivery);
    setStyle(schedule.style);
    setMessage(schedule.message);
    setTopN(String(schedule.topN ?? 10));
    setHours(String(schedule.hoursBeforeEnd ?? 24));
    setRunAtLocal(isoToLocalInput(schedule.runAt));
    setEnabled(schedule.enabled);
  }

  function closeEditor() {
    setEditing(null);
    setCreating(false);
  }

  async function saveSchedule() {
    if (!name.trim()) return onToast("Schedule name is required.", "error");
    if (!message.trim()) return onToast("Message is required.", "error");
    if (needsValue && !value.trim()) return onToast("This audience needs a value.", "error");
    if (kind === "one_time" && !runAtLocal) return onToast("Pick a date & time.", "error");

    setSaving(true);
    try {
      const body: UnknownRecord = {
        name,
        kind,
        audience,
        value,
        delivery,
        style,
        message,
        topN: kind === "war_end_congrats" ? Number(topN) : null,
        hoursBeforeEnd: kind === "war_final_hours" ? Number(hours) : null,
        runAt: kind === "one_time" && runAtLocal ? new Date(runAtLocal).toISOString() : null,
        enabled,
      };
      const res = await fetch(
        editing ? `/api/admin/broadcast/schedules/${editing.id}` : "/api/admin/broadcast/schedules",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save schedule"));
      onToast(editing ? "Schedule updated" : "Schedule created", "success");
      closeEditor();
      onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save schedule", "error");
    } finally {
      setSaving(false);
    }
  }

  async function patchSchedule(schedule: BroadcastSchedule, body: UnknownRecord, errorLabel: string) {
    setBusyId(schedule.id);
    try {
      const res = await fetch(`/api/admin/broadcast/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? errorLabel));
      onRefresh();
      return true;
    } catch (err) {
      onToast(err instanceof Error ? err.message : errorLabel, "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSchedule(schedule: BroadcastSchedule) {
    if (!schedule.enabled) {
      const confirmed = confirmTypedAction(
        `Enable "${schedule.name}"? It will DM/message members automatically when it fires.`,
        "ENABLE"
      );
      if (!confirmed) return;
    }
    const ok = await patchSchedule(
      schedule,
      { enabled: !schedule.enabled },
      `Failed to ${schedule.enabled ? "disable" : "enable"} schedule`
    );
    if (ok) onToast(schedule.enabled ? "Schedule disabled" : "Schedule enabled ✅", schedule.enabled ? "info" : "success");
  }

  async function deleteSchedule(schedule: BroadcastSchedule) {
    if (!confirmTypedAction(`Delete schedule "${schedule.name}"? This stops the automation for good.`, "DELETE")) return;
    setBusyId(schedule.id);
    try {
      const res = await fetch(`/api/admin/broadcast/schedules/${schedule.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to delete schedule"));
      onToast("Schedule deleted", "info");
      onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to delete schedule", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Broadcast Schedules"
        right={
          <div className="flex gap-2">
            <button className="admin-button" type="button" disabled={loading} onClick={onRefresh}>
              ↻
            </button>
            <button className="admin-button" type="button" onClick={startCreate}>
              + New Schedule
            </button>
          </div>
        }
      >
        {openEditor ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">When does it fire?</span>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {BROADCAST_SCHEDULE_KINDS.map((item) => {
                  const active = kind === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setKind(item.id)}
                      className="rounded-xl border px-3 py-3 text-left transition hover:brightness-125"
                      style={{
                        borderColor: active ? "color-mix(in srgb, var(--primary) 45%, var(--border))" : "var(--border)",
                        background: active ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div className="text-sm font-semibold text-white">{item.icon} {item.label}</div>
                      <div className="mt-1 text-xs text-zinc-500">{item.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput label="Schedule Name" value={name} onChange={setName} placeholder={`e.g. ${kindMeta.icon} ${kindMeta.label} nudge`} />
              {kind === "one_time" && (
                <label className="block space-y-2">
                  <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Fire At (your time)</span>
                  <input
                    type="datetime-local"
                    className="admin-input"
                    value={runAtLocal}
                    onChange={(event) => setRunAtLocal(event.target.value)}
                  />
                </label>
              )}
              {kind === "war_end_congrats" && (
                <LabeledInput label="Top N scorers to DM" value={topN} onChange={setTopN} placeholder="10" />
              )}
              {kind === "war_final_hours" && (
                <LabeledInput label="Hours before war end" value={hours} onChange={setHours} placeholder="24" />
              )}
              {kind !== "war_end_congrats" && (
                <label className="block space-y-2">
                  <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Audience</span>
                  <select className="admin-input" value={audience} onChange={(event) => setAudience(event.target.value)}>
                    {BROADCAST_SCHEDULE_AUDIENCE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block space-y-2">
                <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Delivery</span>
                <select className="admin-input" value={delivery} onChange={(event) => setDelivery(event.target.value)}>
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
              <label className="block space-y-2">
                <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">State</span>
                <select className="admin-input" value={enabled ? "on" : "off"} onChange={(event) => setEnabled(event.target.value === "on")}>
                  <option value="on">Enabled — fires automatically</option>
                  <option value="off">Disabled — draft only</option>
                </select>
              </label>
            </div>

            {needsValue && (
              <LabeledInput label="Filter Value" value={value} onChange={setValue} placeholder="Example: 15 or 1000" />
            )}
            {editing?.kind === "one_time" && editing.lastFiredAt && (
              <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                This one-time broadcast already fired and won&apos;t fire again — create a new schedule instead.
              </p>
            )}
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Message</span>
              <textarea
                className="admin-input min-h-32 resize-y"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="⚠️ {username}, war ends in {war_time_left} and you're on {points} points!"
              />
              <span className="admin-label text-xs">Placeholders: {"{ping}"}, {"{username}"}, {"{points}"}, {"{pph}"}, {"{change5m}"}, {"{rank}"}, {"{clan_rank}"}, {"{war_time_left}"}, {"{next_player}"}, {"{next_rank_gap}"}</span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="admin-button" type="button" onClick={closeEditor}>Cancel</button>
              <button className="admin-button" type="button" disabled={saving} onClick={() => void saveSchedule()}>
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Schedule"}
              </button>
            </div>
          </div>
        ) : schedules.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {schedules.map((schedule) => {
              const meta = broadcastScheduleKindMeta(schedule.kind);
              const firedOnce = schedule.kind === "one_time" && Boolean(schedule.lastFiredAt);
              return (
                <div
                  key={schedule.id}
                  className="card-hover space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4"
                  style={{ opacity: schedule.enabled ? 1 : 0.65 }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{schedule.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-300">
                          {meta.icon} {meta.label}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusTone(schedule.enabled ? "enabled" : "disabled")}`}>
                          {schedule.enabled ? "● Enabled" : "○ Disabled"}
                        </span>
                        {firedOnce && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-400">
                            ✓ Fired
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">{broadcastScheduleSummary(schedule)}</div>
                  <p
                    className="text-sm text-zinc-400"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {schedule.message}
                  </p>
                  <div className="text-xs text-zinc-500">
                    {schedule.lastFiredAt
                      ? `Last fired ${formatTime(schedule.lastFiredAt)}${schedule.lastFiredBattle ? ` · ${schedule.lastFiredBattle}` : ""}`
                      : "Never fired yet"}
                    {schedule.createdBy ? ` · by ${schedule.createdBy}` : ""}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      className="admin-button"
                      type="button"
                      disabled={busyId === schedule.id || firedOnce}
                      title={firedOnce ? "One-time schedules can't re-fire" : undefined}
                      onClick={() => void toggleSchedule(schedule)}
                    >
                      {schedule.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="admin-button" type="button" onClick={() => startEdit(schedule)}>
                      Edit
                    </button>
                    <button
                      className="admin-button"
                      type="button"
                      disabled={busyId === schedule.id}
                      onClick={() => void deleteSchedule(schedule)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">No schedules yet — automate war nudges and congrats messages here.</p>
            <button className="admin-button" type="button" onClick={startCreate}>+ New Schedule</button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BroadcastHistoryPanel({
  onToast,
  onReuse,
}: {
  onToast: (message: string, tone: "success" | "error" | "info") => void;
  onReuse: (send: BroadcastSend) => void;
}) {
  const [sends, setSends] = useState<BroadcastSend[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<BroadcastHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<Record<number, BroadcastSendRecipient[]>>({});
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  async function loadHistory(reset: boolean) {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const offset = reset ? 0 : sends.length;
      const res = await fetch(`/api/admin/broadcast/history?limit=25&offset=${offset}&stats=1`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (broadcastTableMissingFrom(data)) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error(String(data.error ?? "Failed to load history"));
      const batch = asArray<BroadcastSend>(data.sends);
      setSends((current) => (reset ? batch : [...current, ...batch]));
      setTotal(Number(data.total ?? 0));
      if (data.stats) setStats(data.stats as BroadcastHistoryStats);
      setMissing(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to load history", "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDetails(send: BroadcastSend) {
    if (expandedId === send.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(send.id);
    if (recipients[send.id]) return;

    setRecipientsLoading(true);
    try {
      const res = await fetch(`/api/admin/broadcast/history/${send.id}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as UnknownRecord;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to load recipients"));
      setRecipients((current) => ({ ...current, [send.id]: asArray<BroadcastSendRecipient>(data.recipients) }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to load recipients", "error");
    } finally {
      setRecipientsLoading(false);
    }
  }

  if (missing) {
    return (
      <Panel title="Bot Restart Needed" right={<span className="text-xs text-zinc-500">🤖</span>}>
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Broadcast logging turns on when the bot boots with the latest{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">main.py</code>. Restart it on Render, then retry.
          </p>
          <button className="admin-button" type="button" disabled={loading} onClick={() => void loadHistory(true)}>
            {loading ? "Checking..." : "↻ Retry"}
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-5">
          <MiniStat label="Sends · 30d" value={stats.sends} />
          <MiniStat label="Messages Delivered" value={stats.delivered} />
          <MiniStat label="Zeros Converted" value={stats.conversions} />
          <MiniStat label="Points Gained" value={stats.pointsGained} />
          <MiniStat label="Pending Checks" value={stats.pending} />
        </div>
      )}

      <Panel
        title="Send History"
        right={
          <button className="admin-button" type="button" disabled={loading} onClick={() => void loadHistory(true)}>
            ↻
          </button>
        }
      >
        {loading ? (
          <p className="text-sm text-zinc-500">Loading broadcast history...</p>
        ) : sends.length ? (
          <div className="space-y-3">
            {sends.map((send) => {
              const source = broadcastSourceMeta(send.source);
              const recipientRows = recipients[send.id];
              const expanded = expandedId === send.id;
              return (
                <div key={send.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${source.chip}`}>
                          {source.icon} {source.label}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-300">
                          {broadcastAudienceLabel(send.audience, send.value)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusTone(send.status === "done" ? "done ok" : send.status)}`}>
                          {send.status}
                        </span>
                      </div>
                      <p
                        className="text-sm text-zinc-300"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {send.message}
                      </p>
                      <div className="text-xs text-zinc-500">
                        {send.actor ?? "Unknown sender"} · {formatTime(send.sentAt)} · {send.matchedCount} matched ·{" "}
                        <span className="text-emerald-300">{send.sentCount} sent</span>
                        {send.failedCount > 0 && <span className="text-red-300"> · {send.failedCount} failed</span>}
                        {send.imageUrl ? <span className="text-violet-300"> · 🖼️ artwork</span> : null}
                      </div>
                      <div className="text-xs">
                        {send.conversionCheckedAt ? (
                          (send.conversionZeroAtSend ?? 0) > 0 ? (
                            <span className="text-emerald-200">
                              🔥 {send.conversionScorers ?? 0}/{send.conversionZeroAtSend} zeros started scoring · +
                              {toDisplayValue(send.conversionPoints ?? 0)} pts gained
                            </span>
                          ) : (
                            <span className="text-zinc-600">Conversion: no zero-pointers in this send</span>
                          )
                        ) : (
                          <span className="text-zinc-500">⏳ Conversion check runs ~24h after send</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="admin-button" type="button" onClick={() => void toggleDetails(send)}>
                        {expanded ? "Hide" : "Details"}
                      </button>
                      <button className="admin-button" type="button" onClick={() => onReuse(send)}>
                        ♻️ Reuse
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                      {recipientsLoading && !recipientRows ? (
                        <p className="text-sm text-zinc-500">Loading recipients...</p>
                      ) : recipientRows?.length ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {recipientRows.map((recipient, index) => (
                            <div
                              key={safeId("broadcast-recipient", recipient.discordId ?? recipient.username, index)}
                              className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium text-white">{recipient.username ?? "Unknown"}</div>
                                <div className="text-xs text-zinc-500">{toDisplayValue(recipient.pointsAtSend)} pts at send</div>
                                {recipient.error && <div className="truncate text-xs text-red-300">{recipient.error}</div>}
                              </div>
                              <span className="shrink-0 text-base">{recipient.delivered ? "✅" : "❌"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">No recipient rows stored for this send.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {sends.length < total && (
              <div className="flex justify-center pt-2">
                <button className="admin-button" type="button" disabled={loadingMore} onClick={() => void loadHistory(false)}>
                  {loadingMore ? "Loading..." : `Load more (${sends.length}/${total})`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Nothing sent yet — every broadcast from Discord, the Hub, and automations lands here with delivery + conversion stats.
          </p>
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
            <div key={safeId("invite-leader", row.user_id ?? row.discord_id, index)} className="row-lift flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
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

function ticketDisplayName(ticket: TicketRow | TicketDetail) {
  return String(ticket.robloxUsername ?? ticket.ticketId ?? "Application");
}

function ticketStatusLabel(status: unknown) {
  const value = String(status ?? "open").toLowerCase();
  if (value === "pending") return "Awaiting review";
  if (value === "accepted") return "Accepted";
  if (value === "closed") return "Closed";
  return "Open";
}

function ticketScreenshotsUploaded(ticket: TicketRow | TicketDetail) {
  return Boolean(ticket.screenshotsUploaded) || Boolean((ticket as TicketDetail).actions?.some((action) => action.action === "screenshots/uploaded"));
}

function ticketFinished(ticket: TicketRow | TicketDetail) {
  return ["accepted", "closed"].includes(String(ticket.status ?? "").toLowerCase());
}

function robloxAvatarUrl(robloxId?: string | null) {
  if (!robloxId) return null;
  return `/api/roblox/avatar?userId=${encodeURIComponent(robloxId)}`;
}

function TicketStageBar({ ticket }: { ticket: TicketRow | TicketDetail }) {
  const submitted = ticketScreenshotsUploaded(ticket);
  const finished = ticketFinished(ticket);
  const steps = [
    { label: "Opened", active: true, tone: "green" },
    { label: "Submitted", active: submitted || finished, tone: "green" },
    { label: "Waiting", active: !finished, tone: "orange" },
    { label: "Finished", active: finished, tone: "green" },
  ];

  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {steps.map((step) => {
        const activeClass = step.tone === "orange"
          ? "bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.45)]"
          : "bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)]";
        const textClass = step.tone === "orange" ? "text-orange-300" : "text-emerald-300";
        return (
          <div key={step.label} className="space-y-1">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${step.active ? activeClass : "bg-white/10"}`} />
            <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${step.active ? textClass : "text-zinc-600"}`}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function hexFromSetting(value: unknown, fallback = "#34D399") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, "0").toUpperCase()}`;
  }
  const raw = String(value ?? fallback).trim();
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : fallback;
}

function validHex(value: string, fallback = "#34D399") {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

function TicketsSection({
  tickets,
  metrics,
  channels,
  isOwner,
  onToast,
  onReload,
}: {
  tickets: TicketRow[];
  metrics: UnknownRecord;
  channels: AdminChannel[];
  isOwner: boolean;
  onToast: (message: string, tone: "success" | "error" | "info") => void;
  onReload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [filter, setFilter] = useState("open");
  const [ticketTab, setTicketTab] = useState<"tickets" | "blacklist" | "builder" | "settings">("tickets");
  const [loading, setLoading] = useState(false);
  const [blacklist, setBlacklist] = useState<TicketBlacklistEntry[]>([]);
  const [blacklistDiscordId, setBlacklistDiscordId] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");
  const [panelChannelId, setPanelChannelId] = useState("");
  const [panelTitle, setPanelTitle] = useState("MCWV Applications");
  const [panelDescription, setPanelDescription] = useState("Ready to apply for MCWV? Open a private application ticket below. Inside the ticket, you’ll send screenshots and submit your Roblox details for staff review.");
  const [panelButton, setPanelButton] = useState("Open Application");
  const [panelColor, setPanelColor] = useState("#34D399");
  const [panelThumbnail, setPanelThumbnail] = useState("");
  const [embedColors, setEmbedColors] = useState({
    banner: "#34D399",
    ticketInstructions: "#34D399",
    review: "#34D399",
    staffInfo: "#60A5FA",
    accepted: "#22C55E",
    closed: "#22C55E",
    reminder: "#F59E0B",
  });
  const [welcomeTitle, setWelcomeTitle] = useState("Thank you for applying for MCWV!");
  const [welcomeDescription, setWelcomeDescription] = useState("Please send the following screenshots of your:\n\n• Pets\n• Rank\n• Masteries\n• Enchants\n• Game-passes\n• Player profile *(found in trading plaza, double tap on avatar)*\n\n**Make sure the screenshots are NON-CROPPED!**");
  const [questions, setQuestions] = useState([
    { key: "roblox_username", label: "Roblox username", placeholder: "Your Roblox username", style: "short", required: true, maxLength: 32 },
    { key: "afk_247", label: "Can you AFK 24/7 on Windows?", placeholder: "Yes/No + details", style: "paragraph", required: true, maxLength: 500 },
    { key: "activity", label: "Discord + in-game active hours", placeholder: "Example: 6h Discord, 12h in-game", style: "paragraph", required: true, maxLength: 500 },
    { key: "liquid_gems", label: "Liquid gems you can spend per war", placeholder: "Example: 5b liquid gems", style: "paragraph", required: true, maxLength: 500 },
    { key: "why_accept", label: "Why should we accept you?", placeholder: "Tell us why you fit MCWV", style: "paragraph", required: true, maxLength: 900 },
  ]);

  useEffect(() => {
    async function loadTicketSettings() {
      const [settingsRes, blacklistRes] = await Promise.all([
        fetch("/api/admin/tickets/settings", { cache: "no-store" }).catch(() => null),
        fetch("/api/admin/tickets/blacklist", { cache: "no-store" }).catch(() => null),
      ]);
      if (blacklistRes?.ok) {
        const blacklistData = await blacklistRes.json().catch(() => ({}));
        setBlacklist(Array.isArray(blacklistData.blacklist) ? blacklistData.blacklist : []);
      }
      const res = settingsRes;
      if (!res?.ok) return;
      const data = await res.json().catch(() => ({}));
      const settings = data.settings ?? {};
      const panel = settings.panel ?? {};
      const messages = settings.messages ?? {};
      if (panel.title) setPanelTitle(String(panel.title));
      if (panel.description) setPanelDescription(String(panel.description));
      if (panel.buttonLabel) setPanelButton(String(panel.buttonLabel));
      if (panel.thumbnailUrl || panel.thumbnail) setPanelThumbnail(String(panel.thumbnailUrl ?? panel.thumbnail ?? ""));
      if (panel.accentColor !== undefined) {
        const rawColor = typeof panel.accentColor === "number"
          ? `#${panel.accentColor.toString(16).padStart(6, "0").slice(-6).toUpperCase()}`
          : String(panel.accentColor);
        setPanelColor(rawColor.startsWith("#") ? rawColor : `#${rawColor}`);
      }
      if (settings.embedColors && typeof settings.embedColors === "object") {
        const rawColors = settings.embedColors as Record<string, unknown>;
        setEmbedColors((current) => ({
          ...current,
          banner: hexFromSetting(rawColors.banner, current.banner),
          ticketInstructions: hexFromSetting(rawColors.ticketInstructions, current.ticketInstructions),
          review: hexFromSetting(rawColors.review, current.review),
          staffInfo: hexFromSetting(rawColors.staffInfo, current.staffInfo),
          accepted: hexFromSetting(rawColors.accepted, current.accepted),
          closed: hexFromSetting(rawColors.closed, current.closed),
          reminder: hexFromSetting(rawColors.reminder, current.reminder),
        }));
      }
      if (messages.welcomeTitle) setWelcomeTitle(String(messages.welcomeTitle));
      if (messages.welcomeDescription) setWelcomeDescription(String(messages.welcomeDescription));
      if (Array.isArray(settings.questions)) setQuestions(settings.questions);
    }
    void loadTicketSettings();
  }, []);

  const filtered = tickets.filter((ticket) => {
    if (filter === "all") return true;
    if (filter === "open") return ["open", "pending"].includes(String(ticket.status ?? "open"));
    return String(ticket.status ?? "") === filter;
  });

  function updateQuestion(index: number, patch: Record<string, unknown>) {
    setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch } : question));
  }

  function updateEmbedColor(key: keyof typeof embedColors, value: string) {
    setEmbedColors((current) => ({ ...current, [key]: value.toUpperCase() }));
  }

  async function saveTicketSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panel: { title: panelTitle, description: panelDescription, buttonLabel: panelButton, accentColor: panelColor, thumbnailUrl: panelThumbnail.trim() },
          messages: { welcomeTitle, welcomeDescription },
          embedColors,
          questions,
          features: { openLimit: 1, acceptButton: true, closeButton: true, staffInfoButton: true, transcripts: true, deleteAfterClose: true, supportHours: false },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save settings"));
      onToast("Ticket settings saved", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setLoading(false);
    }
  }

  async function sendPanel() {
    if (!panelChannelId) {
      onToast("Choose a panel channel first", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "panel_send",
          channel_id: panelChannelId,
          title: panelTitle,
          description: panelDescription,
          button_label: panelButton,
          accent_color: panelColor,
          thumbnail_url: panelThumbnail.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to send panel"));
      onToast("Application panel sent", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to send panel", "error");
    } finally {
      setLoading(false);
    }
  }

  async function reloadBlacklist() {
    const res = await fetch("/api/admin/tickets/blacklist", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => ({}));
    setBlacklist(Array.isArray(data.blacklist) ? data.blacklist : []);
  }

  async function addBlacklistEntry() {
    if (!/^\d{15,25}$/.test(blacklistDiscordId.trim())) {
      onToast("Enter a valid Discord user ID", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId: blacklistDiscordId.trim(), reason: blacklistReason.trim() || "No reason provided" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to blacklist user"));
      setBlacklistDiscordId("");
      setBlacklistReason("");
      onToast("User added to ticket blacklist", "success");
      await reloadBlacklist();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to blacklist user", "error");
    } finally {
      setLoading(false);
    }
  }

  async function removeBlacklistEntry(discordId: string) {
    if (!window.confirm(`Remove ${discordId} from the ticket blacklist?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", discordId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to remove blacklist entry"));
      onToast("Blacklist entry removed", "success");
      await reloadBlacklist();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to remove blacklist entry", "error");
    } finally {
      setLoading(false);
    }
  }

  async function clearTicketRecords() {
    if (!isOwner) return;
    const confirmed = window.prompt(
      "Clear all application ticket records from the website dashboard?\n\nThis does not delete Discord channels. Type CLEAR TICKETS to confirm."
    );
    if (confirmed !== "CLEAR TICKETS") return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to clear tickets"));
      setSelected(null);
      onToast(`Cleared ${data.cleared ?? "all"} ticket record(s)`, "success");
      await onReload();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to clear tickets", "error");
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(ticketId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to load ticket"));
      setSelected(data.ticket ?? null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to load ticket", "error");
    } finally {
      setLoading(false);
    }
  }

  async function runTicketAction(action: "accept" | "close", ticketId: string) {
    const reason = action === "close" ? window.prompt("Close reason", "Closed from Hub") ?? "" : "";
    if (action === "close" && !reason.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ticketId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Ticket action failed"));
      onToast(action === "accept" ? "Ticket accepted" : "Ticket closed", "success");
      if (data.ticket) setSelected(data.ticket);
      await onReload();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Ticket action failed", "error");
    } finally {
      setLoading(false);
    }
  }

  const filters = ["open", "pending", "accepted", "closed", "all"];
  const ticketTabs = [
    { id: "tickets", label: "Ticket Queue", icon: "🎫" },
    { id: "blacklist", label: "Blacklist", icon: "🚫" },
    { id: "builder", label: "Panel Builder", icon: "🧩" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ] as const;
  const recentTickets = [...tickets].slice(0, 4);
  const openTicketCount = tickets.filter((ticket) => ["open", "pending"].includes(String(ticket.status ?? "open"))).length;
  const acceptedTicketCount = tickets.filter((ticket) => String(ticket.status ?? "") === "accepted").length;
  const closedTicketCount = tickets.filter((ticket) => String(ticket.status ?? "") === "closed").length;
  const conversionRate = tickets.length ? Math.round((acceptedTicketCount / tickets.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total Tickets" value={toDisplayValue(metrics.total ?? tickets.length)} />
        <Metric label="Open" value={toDisplayValue(metrics.open ?? 0)} />
        <Metric label="Pending" value={toDisplayValue(metrics.pending ?? 0)} />
        <Metric label="Accepted" value={toDisplayValue(metrics.accepted ?? 0)} />
        <Metric label="Closed" value={toDisplayValue(metrics.closed ?? 0)} />
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(3,7,18,0.96))] p-5 shadow-2xl shadow-emerald-950/20">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Tickets Control Center</div>
            <h3 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Application system studio</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">A polished MCWV workspace for panels, ticket queue, application questions, colours, embeds, and staff actions.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-[26rem]">
            {recentTickets.length ? recentTickets.map((ticket) => (
              <button key={ticket.ticketId} type="button" onClick={() => void openTicket(ticket.ticketId)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-emerald-400/30 hover:bg-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(ticket.status ?? "open")}`}>{ticket.status ?? "open"}</span>
                  <span className="text-[10px] text-zinc-500">Last message {formatTime(ticket.lastMessageAt ?? ticket.updatedAt)}</span>
                </div>
                <div className="mt-2 truncate text-sm font-bold text-white">{ticket.robloxUsername ?? ticket.ticketId}</div>
              </button>
            )) : <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-zinc-500">No recent tickets yet.</div>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-black/20 p-2">
          {ticketTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTicketTab(tab.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${ticketTab === tab.id ? "bg-emerald-400 text-black shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:bg-white/10 hover:text-white"}`}
            >
              <span className="mr-2">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {ticketTab === "blacklist" && (
      <Panel title="Ticket Blacklist" right={<button className="admin-button" disabled={loading} onClick={() => void reloadBlacklist()} type="button">Refresh</button>}>
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[1.65rem] border border-white/10 bg-black/25 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Add blocked user</div>
            <h4 className="mt-2 text-2xl font-black text-white">Block ticket access</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Add a Discord user ID and a clear reason. If they are in the server, the bot also applies the blacklist role.</p>
            <div className="mt-5 space-y-3">
              <LabeledInput label="Discord User ID" value={blacklistDiscordId} onChange={setBlacklistDiscordId} placeholder="123456789012345678" />
              <label className="block space-y-2">
                <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Reason</span>
                <textarea className="admin-input min-h-28 resize-y" value={blacklistReason} onChange={(event) => setBlacklistReason(event.target.value)} placeholder="Reason shown internally and to the blocked applicant" />
              </label>
              <button className="admin-button-danger w-full" disabled={loading} onClick={() => void addBlacklistEntry()} type="button">Add to Blacklist</button>
            </div>
          </div>

          <div className="space-y-3">
            {blacklist.length ? blacklist.map((entry) => (
              <div key={entry.discordId} className="group flex flex-col gap-4 rounded-[1.65rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4 transition hover:border-red-400/30 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={entry.avatarUrl ?? `https://cdn.discordapp.com/embed/avatars/${Number(entry.discordId.slice(-1)) % 5}.png`}
                    alt="Discord avatar"
                    className="h-14 w-14 rounded-2xl border border-white/10 object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-black text-white">{entry.displayName ?? entry.username ?? entry.discordId}</div>
                    <div className="text-xs text-zinc-500">{entry.discordId} · Added {formatTime(entry.createdAt)}</div>
                    <div className="mt-1 text-sm text-zinc-300">{entry.reason || "No reason provided"}</div>
                  </div>
                </div>
                <button className="admin-button" disabled={loading} onClick={() => void removeBlacklistEntry(entry.discordId)} type="button">Remove</button>
              </div>
            )) : (
              <div className="rounded-[1.65rem] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
                <div className="text-4xl">✅</div>
                <div className="mt-3 text-lg font-bold text-white">No blacklisted users</div>
                <p className="mt-1 text-sm text-zinc-500">Blocked applicants will appear here with their Discord avatar and reason.</p>
              </div>
            )}
          </div>
        </div>
      </Panel>
      )}

      {ticketTab === "builder" && (
      <Panel title="Application Panel Builder" right={<span className="text-xs text-zinc-500">Sends the Discord application panel</span>}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Panel Channel</span>
              <select className="admin-input" value={panelChannelId} onChange={(event) => setPanelChannelId(event.target.value)}>
                <option value="">Select a channel...</option>
                {channels.filter((channel) => channel.canSendMessages).map((channel) => (
                  <option key={channel.id} value={channel.id}>{channelDisplayName(channel)}</option>
                ))}
              </select>
            </label>
            <LabeledInput label="Panel Title" value={panelTitle} onChange={setPanelTitle} />
            <LabeledInput label="Button Label" value={panelButton} onChange={setPanelButton} />
            <LabeledInput label="Thumbnail URL" value={panelThumbnail} onChange={setPanelThumbnail} placeholder="Optional HTTPS image URL" />
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
              <label className="block space-y-2">
                <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Hex Colour</span>
                <input
                  aria-label="Panel hex colour picker"
                  className="h-12 w-20 cursor-pointer rounded-2xl border border-white/10 bg-black/30 p-1"
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(panelColor) ? panelColor : "#34D399"}
                  onChange={(event) => setPanelColor(event.target.value.toUpperCase())}
                />
              </label>
              <LabeledInput label="Hex Value" value={panelColor} onChange={setPanelColor} placeholder="#34D399" />
            </div>
            <label className="block space-y-2">
              <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Panel Description</span>
              <textarea className="admin-input min-h-28 resize-y" value={panelDescription} onChange={(event) => setPanelDescription(event.target.value)} />
            </label>
            <div className="flex justify-end">
              <button className="admin-button" disabled={loading} onClick={() => void sendPanel()} type="button">Send Panel</button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5" style={{ borderLeft: `4px solid ${/^#[0-9A-Fa-f]{6}$/.test(panelColor) ? panelColor : "#34D399"}` }}>
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Live Preview</div>
              {panelThumbnail.trim().startsWith("https://") && (
                <img
                  src={panelThumbnail.trim()}
                  alt="Panel thumbnail preview"
                  className="h-20 w-20 rounded-2xl border border-white/10 object-cover"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              )}
            </div>
            <h4 className="mt-3 text-2xl font-bold text-white">{panelTitle || "MCWV Applications"}</h4>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{panelDescription}</p>
            <div
              className="mt-5 inline-flex rounded-2xl px-4 py-2 text-sm font-bold text-black"
              style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(panelColor) ? panelColor : "#34D399" }}
            >
              {panelButton || "Open Application"}
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-400">
              Applicants answer the modal before a ticket is created. Staff info stays hidden behind the Staff Info button.
            </div>
          </div>
        </div>
      </Panel>
      )}

      {ticketTab === "settings" && (
      <Panel title="Application Settings" right={<button className="admin-button" disabled={loading} onClick={() => void saveTicketSettings()} type="button">Save Settings</button>}>
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Ticket Welcome Message</h4>
              <div className="mt-4 space-y-3">
                <LabeledInput label="Screenshot Embed Title" value={welcomeTitle} onChange={setWelcomeTitle} />
                <label className="block space-y-2">
                  <span className="admin-label text-xs font-semibold uppercase tracking-[0.2em]">Screenshot Embed Description</span>
                  <textarea className="admin-input min-h-40 resize-y" value={welcomeDescription} onChange={(event) => setWelcomeDescription(event.target.value)} />
                </label>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Ticket Embed Hex Colours</h4>
              <p className="mt-2 text-xs text-zinc-500">Controls the colours used by embeds inside application tickets and the staff control flow.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {([
                  ["banner", "Banner Image Embed"],
                  ["ticketInstructions", "Screenshot Instructions"],
                  ["review", "Staff Control Embed"],
                  ["staffInfo", "Staff Info Embed"],
                  ["accepted", "Accepted Embed"],
                  ["closed", "Closed/Transcript Embed"],
                  ["reminder", "Screenshot Reminder"],
                ] as Array<[keyof typeof embedColors, string]>).map(([key, label]) => (
                  <div key={key} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <span className="admin-label text-xs font-semibold uppercase tracking-[0.18em]">{label}</span>
                    <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
                      <input
                        aria-label={`${label} colour picker`}
                        className="h-11 w-14 cursor-pointer rounded-xl border border-white/10 bg-black/30 p-1"
                        type="color"
                        value={validHex(embedColors[key])}
                        onChange={(event) => updateEmbedColor(key, event.target.value)}
                      />
                      <input
                        className="admin-input"
                        value={embedColors[key]}
                        onChange={(event) => updateEmbedColor(key, event.target.value)}
                        placeholder="#34D399"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Application Questions</h4>
              <div className="mt-4 space-y-3">
                {questions.map((question, index) => (
                  <div key={String(question.key ?? index)} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Question {index + 1}{index === 0 ? " · Roblox username" : ""}</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input className="admin-input" value={String(question.label ?? "")} onChange={(event) => updateQuestion(index, { label: event.target.value })} placeholder="Question label" disabled={index === 0} />
                      <input className="admin-input" value={String(question.placeholder ?? "")} onChange={(event) => updateQuestion(index, { placeholder: event.target.value })} placeholder="Placeholder" />
                      <select className="admin-input" value={String(question.style ?? "paragraph")} onChange={(event) => updateQuestion(index, { style: event.target.value })} disabled={index === 0}>
                        <option value="short">Short answer</option>
                        <option value="paragraph">Long answer</option>
                      </select>
                      <input className="admin-input" type="number" value={Number(question.maxLength ?? 500)} onChange={(event) => updateQuestion(index, { maxLength: Number(event.target.value) })} min={16} max={1000} />
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                      <input type="checkbox" checked={Boolean(question.required)} onChange={(event) => updateQuestion(index, { required: event.target.checked })} disabled={index === 0} /> Required
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Feature Settings</h4>
              <div className="mt-4 grid gap-2">
                {["Open limit: 1", "Accept button: enabled", "Close button: enabled", "Staff Info button: enabled", "Transcripts: enabled", "Delete after close: enabled", "Support hours: coming soon", "Archive category: coming soon"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">{item}</div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">User-facing Flow</h4>
              <ol className="mt-4 space-y-3 text-sm text-zinc-300">
                <li>1. Applicant clicks the panel button.</li>
                <li>2. They answer the modal questions before a ticket is made.</li>
                <li>3. Bot creates a private ticket and asks for screenshots.</li>
                <li>4. Staff use Staff Info, then Accept or Close.</li>
              </ol>
            </div>
          </div>
        </div>
      </Panel>
      )}

      {ticketTab === "tickets" && (
      <Panel
        title="Ticket Queue"
        right={
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <button
                className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-200 transition hover:bg-red-500/20"
                disabled={loading || tickets.length === 0}
                onClick={() => void clearTicketRecords()}
                type="button"
              >
                Clear Test Records
              </button>
            )}
            {filters.map((item) => (
              <button
                key={item}
                className={`rounded-full border px-3 py-1 text-xs capitalize transition-all duration-300 hover:-translate-y-0.5 active:scale-95 ${filter === item ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.2)]" : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"}`}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[1.4fr_0.85fr]">
          <div className="space-y-3">
            {filtered.length ? filtered.map((ticket) => (
              <button
                key={ticket.ticketId}
                type="button"
                onClick={() => void openTicket(ticket.ticketId)}
                className="shine-sweep glow-spin group relative overflow-hidden rounded-[1.65rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4 text-left shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/35 hover:bg-white/[0.08] hover:shadow-emerald-950/30 active:scale-[0.99]"
              >
                <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400 opacity-70 transition group-hover:opacity-100" />
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <img
                      src={robloxAvatarUrl(ticket.robloxId) ?? "/favicon.ico"}
                      alt="Roblox avatar"
                      className="mt-1 h-16 w-16 shrink-0 rounded-2xl border border-white/10 bg-black/30 object-cover shadow-lg transition duration-300 group-hover:scale-105 group-hover:border-emerald-400/30"
                      onError={(event) => { event.currentTarget.src = "/favicon.ico"; }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(ticket.status ?? "open")}`}>{ticketStatusLabel(ticket.status)}</span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-500">{shortenMiddle(ticket.ticketId, 8, 6)}</span>
                      </div>
                      <div className="mt-3 truncate text-xl font-black text-white">{ticketDisplayName(ticket)}</div>
                      <div className="mt-1 text-xs text-zinc-500">Discord ID {ticket.openerDiscordId ?? "—"} · Channel {ticket.channelId ? `#${shortenMiddle(ticket.channelId, 5, 5)}` : "not saved"}</div>
                      <TicketStageBar ticket={ticket} />
                    </div>
                  </div>
                  <div className="grid min-w-[9rem] gap-2 text-left text-xs text-zinc-500 lg:text-right">
                    <span>Opened <b className="text-zinc-300">{formatTime(ticket.createdAt)}</b></span>
                    <span>Last message <b className="text-zinc-300">{formatTime(ticket.lastMessageAt ?? ticket.updatedAt)}</b></span>
                    <span className="inline-flex items-center justify-end gap-1 font-bold text-emerald-300 transition group-hover:translate-x-1">Open details <span aria-hidden="true">→</span></span>
                  </div>
                </div>
              </button>
            )) : (
              <div className="rounded-[1.65rem] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
                <div className="text-4xl">🎫</div>
                <div className="mt-3 text-lg font-bold text-white">No tickets in this view</div>
                <p className="mt-1 text-sm text-zinc-500">Try another status filter or send a new application panel.</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.65rem] border border-white/10 bg-black/25 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Operations</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniStat label="Active queue" value={openTicketCount} />
                <MiniStat label="Conversion" value={`${conversionRate}%`} />
                <MiniStat label="Accepted" value={acceptedTicketCount} />
                <MiniStat label="Closed" value={closedTicketCount} />
              </div>
            </div>
            <div className="rounded-[1.65rem] border border-white/10 bg-black/25 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Discord Panel Preview</div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#2b2d31] p-4 shadow-2xl" style={{ borderLeft: `4px solid ${validHex(panelColor)}` }}>
                <div className="text-lg font-black text-white">{panelTitle || "MCWV Applications"}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{panelDescription || "Panel description"}</p>
                <div className="mt-4 inline-flex rounded-xl px-3 py-2 text-xs font-black text-black" style={{ backgroundColor: validHex(panelColor) }}>{panelButton || "Open Application"}</div>
              </div>
            </div>
            <div className="rounded-[1.65rem] border border-emerald-400/15 bg-emerald-400/[0.04] p-5 text-sm text-emerald-100">
              <b>Tip:</b> use Settings to tune colours/questions, then Panel Builder to ship the updated panel to Discord.
            </div>
          </div>
        </div>
      </Panel>
      )}

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 sm:px-6">
          <button className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity" onClick={() => setSelected(null)} aria-label="Close ticket" />
          <div className="relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#070a12] shadow-2xl shadow-black/60 sm:rounded-[2rem]">
            <div className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(3,7,18,0.98))] p-4 sm:p-7">
              <div className="absolute right-8 top-4 hidden text-8xl font-black text-white/[0.03] sm:block">TICKET</div>
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <img
                    src={robloxAvatarUrl(selected.robloxId ?? selected.application?.robloxId) ?? "/favicon.ico"}
                    alt="Roblox avatar"
                    className="h-14 w-14 shrink-0 rounded-2xl border border-white/10 bg-black/30 object-cover shadow-2xl sm:h-20 sm:w-20 sm:rounded-3xl"
                    onError={(event) => { event.currentTarget.src = "/favicon.ico"; }}
                  />
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(selected.status ?? "open")}`}>{ticketStatusLabel(selected.status)}</span>
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-zinc-400">{shortenMiddle(selected.ticketId, 9, 7)}</span>
                  </div>
                  <h3 className="mt-3 truncate text-2xl font-black tracking-tight text-white sm:mt-4 sm:text-5xl">{ticketDisplayName(selected)}</h3>
                  <p className="mt-2 break-words text-xs text-zinc-400 sm:text-sm">Discord ID {selected.openerDiscordId ?? "—"}<span className="hidden sm:inline"> · </span><br className="sm:hidden" />Roblox {selected.robloxId ?? selected.application?.robloxId ?? "—"}</p>
                  <div className="max-w-2xl"><TicketStageBar ticket={selected} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  {selected.channelId && <a className="admin-button text-center" href={`https://discord.com/channels/${selected.guildId}/${selected.channelId}`} target="_blank" rel="noreferrer">Open Discord ↗</a>}
                  <button className="admin-button" disabled={loading || selected.status === "accepted"} onClick={() => void runTicketAction("accept", selected.ticketId)} type="button">Accept</button>
                  <button className="admin-button-danger" disabled={loading || selected.status === "closed"} onClick={() => void runTicketAction("close", selected.ticketId)} type="button">Delete</button>
                  <button className="admin-button" type="button" onClick={() => setSelected(null)} aria-label="Close popup">×</button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-5">
                  <Panel title="Application Answers">
                    {selected.application ? (
                      <div className="grid gap-3 text-sm text-zinc-300 md:grid-cols-2">
                        <MiniStat label="Roblox" value={`${selected.application.robloxUsername ?? "—"} (${selected.application.robloxId ?? "—"})`} />
                        <MiniStat label="Submitted" value={formatTime(selected.application.submittedAt)} />
                        <MiniStat label="AFK 24/7 on Windows" value={selected.application.afk247 ?? "—"} />
                        <MiniStat label="Activity" value={selected.application.activity ?? "—"} />
                        <MiniStat label="Liquid Gems" value={selected.application.liquidGems ?? "—"} />
                        <MiniStat label="Why accept" value={selected.application.whyAccept ?? "—"} />
                      </div>
                    ) : <p className="text-sm text-zinc-500">No application answers found.</p>}
                  </Panel>

                  {selected.transcript?.text && (
                    <Panel title="Transcript">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button className="admin-button" type="button" onClick={() => navigator.clipboard.writeText(selected.transcript?.text ?? "")}>Copy Transcript</button>
                      </div>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-5 text-zinc-300">{selected.transcript.text}</pre>
                    </Panel>
                  )}
                </div>

                <div className="space-y-5">
                  <Panel title="Ticket Snapshot">
                    <div className="grid gap-3 text-sm">
                      <MiniStat label="Opened" value={formatTime(selected.createdAt)} />
                      <MiniStat label="Last message" value={formatTime(selected.lastMessageAt ?? selected.updatedAt)} />
                      <MiniStat label="Channel" value={selected.channelId ? `#${selected.channelId}` : "Not saved"} />
                      <MiniStat label="Status" value={ticketStatusLabel(selected.status)} />
                    </div>
                  </Panel>

                  <Panel title="Action Timeline">
                    <div className="space-y-3">
                      {(selected.actions ?? []).length ? (selected.actions ?? []).slice(0, 12).map((action, index) => (
                        <div key={safeId("ticket-action", action.action, index)} className="relative rounded-2xl border border-white/10 bg-black/25 p-3 pl-4 text-sm">
                          <div className="absolute -left-1 top-4 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
                          <div className="font-bold text-white">{action.action ?? "Action"}</div>
                          <div className="text-xs text-zinc-500">{formatTime(action.createdAt)} · {action.actorDiscordId ?? "system"}</div>
                          {action.message && <div className="mt-1 text-zinc-400">{action.message}</div>}
                        </div>
                      )) : <p className="text-sm text-zinc-500">No actions recorded yet.</p>}
                    </div>
                  </Panel>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
          className="w-full rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12)] sm:w-72"
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
                <tr key={safeId("player", id, index)} className="transition-colors duration-200 hover:bg-white/[0.05]">
                  <td className="px-3 py-4">
                    {player.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatar} alt="" className="h-10 w-10 rounded-full border border-white/10" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">👤</div>
                    )}
                  </td>
                  <td className="px-3 py-4 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="max-w-[13rem] truncate" title={String(username)}>{username}</div>
                      {Boolean(player.onLoa) && (
                        <span
                          className="whitespace-nowrap rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-300"
                          title="Leave of Absence — excused from wars and tracking"
                        >
                          🏝️ LOA
                        </span>
                      )}
                    </div>
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
              <tr key={safeId("link", row.discord, index)} className="transition-colors duration-200 hover:bg-white/[0.05]">
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
      <WarSchedulePanel />
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WarSchedulePanel() {
  type WarScheduleBattle = {
    battleId: string;
    battleName: string | null;
    startTime: string | null;
    endTime: string | null;
    manuallyEdited: boolean;
    editedBy: string | null;
    editedAt: string | null;
  };

  const [battles, setBattles] = useState<WarScheduleBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { start: string; end: string }>>({});
  const [newBattle, setNewBattle] = useState({ battleId: "", start: "", end: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/wars", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { battles?: WarScheduleBattle[] } | null;
      setBattles(json?.battles ?? []);
    } catch {
      setBattles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const draftFor = (b: WarScheduleBattle) => ({
    start: drafts[b.battleId]?.start ?? toLocalInput(b.startTime),
    end: drafts[b.battleId]?.end ?? toLocalInput(b.endTime),
  });

  const save = async (battleId: string) => {
    const d = drafts[battleId];
    if (!d) return;
    setBusyId(battleId);
    setError("");
    setNotice("");
    try {
      const payload = {
        startTime: d.start ? new Date(d.start).toISOString() : null,
        endTime: d.end ? new Date(d.end).toISOString() : null,
      };
      const res = await fetch(`/api/admin/wars/${encodeURIComponent(battleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setNotice(`Saved ${battleId} (manual override active — the API can't overwrite it).`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[battleId];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  };

  const reset = async (battleId: string) => {
    setBusyId(battleId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/wars/${encodeURIComponent(battleId)}`, { method: "POST" });
      const json = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Reset failed");
      setNotice(`${battleId} back under API control.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (battleId: string) => {
    if (!window.confirm(`Delete ${battleId} from the schedule?`)) return;
    setBusyId(battleId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/wars/${encodeURIComponent(battleId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");
      setNotice(`${battleId} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (!newBattle.battleId.trim()) {
      setError("Battle ID is required (e.g. NinjaBattle2026).");
      return;
    }
    setBusyId("__new__");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/wars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          battleId: newBattle.battleId.trim(),
          startTime: newBattle.start ? new Date(newBattle.start).toISOString() : null,
          endTime: newBattle.end ? new Date(newBattle.end).toISOString() : null,
        }),
      });
      const json = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Create failed");
      setNotice(`${newBattle.battleId} added to the schedule.`);
      setNewBattle({ battleId: "", start: "", end: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title="War Schedule — Date Editor"
      right={
        <span className="text-xs text-zinc-500">
          Manual dates override the PS99 API everywhere (reports, projections, broadcast triggers)
        </span>
      }
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-zinc-500">Loading war schedule…</p>
      ) : battles.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          No battles recorded yet. Add an upcoming war below so the Hub knows its dates before the API does.
        </p>
      ) : (
        <div className="space-y-3">
          {battles.map((b) => {
            const d = draftFor(b);
            const isBusy = busyId === b.battleId;
            return (
              <div
                key={b.battleId}
                className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-end"
              >
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-100">{b.battleId}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        b.manuallyEdited
                          ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
                          : "border-zinc-600 bg-zinc-800/60 text-zinc-400"
                      }`}
                    >
                      {b.manuallyEdited ? "✋ manual override" : "auto (API)"}
                    </span>
                  </div>
                  {b.editedAt && b.manuallyEdited && (
                    <div className="text-[11px] text-zinc-500">last edited {new Date(b.editedAt).toLocaleString()}</div>
                  )}
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Start (local)</span>
                  <input
                    type="datetime-local"
                    value={d.start}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [b.battleId]: { ...d, start: e.target.value } }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-400/60"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">End (local)</span>
                  <input
                    type="datetime-local"
                    value={d.end}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [b.battleId]: { ...d, end: e.target.value } }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-400/60"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void save(b.battleId)}
                    disabled={isBusy}
                    className="rounded-xl bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
                  >
                    {isBusy ? "…" : "Save"}
                  </button>
                  {b.manuallyEdited && (
                    <button
                      onClick={() => void reset(b.battleId)}
                      disabled={isBusy}
                      className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => void remove(b.battleId)}
                    disabled={isBusy}
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Add upcoming war</div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <input
            type="text"
            placeholder="Battle ID (e.g. NinjaBattle2026)"
            value={newBattle.battleId}
            onChange={(e) => setNewBattle((prev) => ({ ...prev, battleId: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-400/60"
          />
          <input
            type="datetime-local"
            value={newBattle.start}
            onChange={(e) => setNewBattle((prev) => ({ ...prev, start: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-400/60"
          />
          <input
            type="datetime-local"
            value={newBattle.end}
            onChange={(e) => setNewBattle((prev) => ({ ...prev, end: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-400/60"
          />
          <button
            onClick={() => void create()}
            disabled={busyId === "__new__"}
            className="rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busyId === "__new__" ? "…" : "Add battle"}
          </button>
        </div>
      </div>
    </Panel>
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
              className={`rounded-full border px-3 py-1 text-xs capitalize transition-all duration-300 hover:-translate-y-0.5 active:scale-95 ${filter === item ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.2)]" : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"}`}
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

type LeaderboardBadgePreset = {
  key: string;
  label: string;
  emoji: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
  linkedDiscordRoleId?: string | null;
  linkedDiscordRoleName?: string | null;
  exclusiveTier?: boolean | null;
};

type BadgeRoleOption = {
  id: string;
  name: string;
  guildName?: string;
  memberCount?: number;
};

type BadgeRoleSyncMeta = {
  at?: string;
  trigger?: string;
  ok?: boolean;
  presets?: number;
  usersChecked?: number;
  usersSkipped?: number;
  grants?: number;
  removals?: number;
  error?: string | null;
} | null;

function isSingleBadgeEmoji(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/[A-Za-z0-9]/.test(trimmed)) return false;
  if (Array.from(trimmed).length > 8) return false;
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\uFE0E)?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\uFE0E)?)*$/u.test(trimmed);
}

function BadgePresetManager() {
  const [presets, setPresets] = useState<LeaderboardBadgePreset[]>([]);
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState("#34d399");
  const [roleId, setRoleId] = useState("");
  const [tier, setTier] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [roles, setRoles] = useState<BadgeRoleOption[]>([]);
  const [rolesNote, setRolesNote] = useState("");
  const [syncMeta, setSyncMeta] = useState<BadgeRoleSyncMeta>(null);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const editing = presets.find((preset) => preset.key === editingKey) ?? null;

  // If the editing target links to a role the bot didn't return (bot asleep,
  // role deleted), keep that role selectable so saving can't silently unlink.
  const roleOptions = useMemo(() => {
    if (editing?.linkedDiscordRoleId && !roles.some((role) => role.id === editing.linkedDiscordRoleId)) {
      return [
        {
          id: editing.linkedDiscordRoleId,
          name: `${editing.linkedDiscordRoleName ?? "Linked role"} (not loaded)`,
        },
        ...roles,
      ];
    }
    return roles;
  }, [editing, roles]);

  async function loadPresets() {
    const res = await fetch("/api/leaderboard/badges", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => ({}));
    setPresets(Array.isArray(data.presets) ? data.presets : []);
    setSyncMeta(data.sync && typeof data.sync === "object" ? (data.sync as BadgeRoleSyncMeta) : null);
  }

  async function loadRoles() {
    const res = await fetch("/api/leaderboard/badges/roles", { cache: "no-store" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setRoles([]);
      setRolesNote(String(data.error ?? "Could not load Discord roles from the bot."));
      return;
    }
    const list: unknown[] = Array.isArray(data.roles) ? data.roles : [];
    setRoles(
      list
        .filter((role: unknown): role is Record<string, unknown> => Boolean(role) && typeof role === "object")
        .map((role) => ({
          id: String(role.id ?? ""),
          name: String(role.name ?? ""),
          guildName: role.guildName ? String(role.guildName) : undefined,
          memberCount: typeof role.memberCount === "number" ? role.memberCount : undefined,
        }))
        .filter((role) => role.id && role.name)
    );
    setRolesNote("");
  }

  useEffect(() => {
    void loadPresets();
    void loadRoles();
  }, []);

  function resetForm() {
    setLabel("");
    setEmoji("");
    setColor("#34d399");
    setRoleId("");
    setTier(false);
    setEditingKey(null);
  }

  function startEdit(preset: LeaderboardBadgePreset) {
    setEditingKey(preset.key);
    setLabel(preset.label);
    setEmoji(preset.emoji ?? "");
    setColor(preset.color);
    setRoleId(preset.linkedDiscordRoleId ?? "");
    setTier(Boolean(preset.exclusiveTier));
    setStatus(`Editing “${preset.label}” — save to apply, or cancel.`);
  }

  async function savePreset() {
    if (!label.trim()) {
      setStatus("Add a badge name first.");
      return;
    }

    if (!isSingleBadgeEmoji(emoji)) {
      setStatus("Emoji must be one emoji only, or blank.");
      return;
    }

    setLoading(true);
    setStatus(editing ? "Saving changes..." : "Saving badge preset...");

    try {
      const linkedRoleName = roleId
        ? roleOptions.find((role) => role.id === roleId)?.name?.replace(/ \(not loaded\)$/, "") ?? null
        : null;
      const res = await fetch("/api/leaderboard/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { key: editing.key } : {}),
          label: label.trim(),
          emoji: emoji.trim() || null,
          color,
          enabled: true,
          sortOrder: editing
            ? editing.sortOrder
            : presets.length
            ? Math.max(...presets.map((preset) => preset.sortOrder)) + 1
            : 0,
          linkedDiscordRoleId: roleId || null,
          linkedDiscordRoleName: linkedRoleName,
          exclusiveTier: tier && Boolean(roleId),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save badge"));

      const wasLinked = Boolean(roleId);
      resetForm();
      setStatus(
        editing
          ? wasLinked
            ? `Badge updated — still linked to ${linkedRoleName ?? "the role"}, members stay in sync.`
            : "Badge updated."
          : wasLinked
          ? `Badge saved & linked to ${linkedRoleName ?? "the role"} — a sync just ran, so role members have it already.`
          : "Badge preset saved."
      );
      await loadPresets();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save badge");
    } finally {
      setLoading(false);
      window.setTimeout(() => setStatus(""), 3200);
    }
  }

  async function movePreset(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= presets.length) return;

    const next = [...presets];
    [next[index], next[target]] = [next[target], next[index]];
    setPresets(next);

    setLoading(true);
    setStatus("Saving badge order...");

    try {
      const res = await fetch("/api/leaderboard/badges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: next.map((preset) => preset.key) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save order"));
      setStatus("Badge order saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save order");
      await loadPresets(); // revert optimistic swap
    } finally {
      setLoading(false);
      window.setTimeout(() => setStatus(""), 2200);
    }
  }

  async function deletePreset(key: string, name: string) {
    if (!confirmAction(`Delete the ${name} badge preset? This removes it from player cards too.`)) return;

    setLoading(true);
    setStatus("Deleting badge preset...");

    try {
      const res = await fetch(`/api/leaderboard/badges?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Failed to delete badge"));

      if (editingKey === key) resetForm();
      setStatus("Badge preset deleted.");
      await loadPresets();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete badge");
    } finally {
      setLoading(false);
      window.setTimeout(() => setStatus(""), 2200);
    }
  }

  async function runRoleSync() {
    setSyncing(true);
    setStatus("Syncing badges with Discord roles...");

    try {
      const res = await fetch("/api/leaderboard/badges/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Role sync failed"));

      const stats = isRecord(data.stats) ? data.stats : {};
      setStatus(
        `Role sync done: ${Number(stats.grants ?? 0)} badge(s) added, ${Number(stats.removals ?? 0)} removed across ${Number(stats.usersChecked ?? 0)} member(s).`
      );
      await loadPresets();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Role sync failed");
    } finally {
      setSyncing(false);
      window.setTimeout(() => setStatus(""), 5000);
    }
  }

  return (
    <Panel
      title="Leaderboard Badge Presets"
      right={<span className="text-xs text-zinc-500">Owner only</span>}
    >
      <div className="space-y-5">
        <p className="text-sm text-zinc-400">
          Create the badge options for leaderboard profile cards. Officers pin them by hand — or link a badge to a Discord server role (like OG) and it appears on members&apos; cards automatically. Roles are only ever read, never edited.
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_6rem_7rem_auto] sm:items-end">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Badge Name</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="admin-input"
              placeholder="Donator"
              maxLength={32}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Emoji</span>
            <input
              value={emoji}
              onChange={(event) => {
                const next = event.target.value;
                if (isSingleBadgeEmoji(next)) setEmoji(next.trim());
              }}
              className="admin-input text-center text-lg"
              placeholder="💎"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Colour</span>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30"
            />
          </label>
          <div className="flex gap-2">
            {editing && (
              <button
                type="button"
                className="admin-button"
                disabled={loading}
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className="admin-button"
              disabled={loading}
              onClick={() => void savePreset()}
            >
              {editing ? "Save Changes" : "Add Preset"}
            </button>
          </div>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Link Discord Role (optional)</span>
          <select
            className="admin-input"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
          >
            <option value="">No link — officers pin this badge by hand</option>
            {roleOptions.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
                {role.guildName ? ` · ${role.guildName}` : ""}
                {typeof role.memberCount === "number" ? ` · ${role.memberCount} member${role.memberCount === 1 ? "" : "s"}` : ""}
              </option>
            ))}
          </select>
          <span className="admin-label block text-xs">
            {roleId
              ? "Members holding that role in the Discord server get this badge automatically — lose the role, lose the badge. Read-only: no roles are ever created, assigned, or edited."
              : "Link a role (e.g. OG) to make this badge fully automatic — or use ✎ on a badge below to link it."}
            {rolesNote ? ` ${rolesNote}` : ""}
          </span>
        </label>

        <label className={`flex items-start gap-2 text-sm transition ${roleId ? "text-zinc-200" : "text-zinc-600"}`}>
          <input
            type="checkbox"
            className="mt-1"
            checked={tier}
            disabled={!roleId}
            onChange={(event) => setTier(event.target.checked)}
          />
          <span>
            <b>★ Tier badge</b> — a member only shows their <b>highest</b> tier badge, ranked by your Discord role list
            (Owner hides Head Officer &amp; Officer; Head Officer hides Officer, and so on). Needs a linked role.
          </span>
        </label>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-400">
            <span className="mr-1">🔗</span>
            Role-linked badges refresh automatically in the background.
            {syncMeta?.at ? (
              <>
                {" "}Last run {formatRelativeTime(syncMeta.at, Date.now())}{syncMeta.ok === false ? " (failed)" : ""} · {syncMeta.grants ?? 0} added · {syncMeta.removals ?? 0} removed
                {syncMeta.error ? ` · ${syncMeta.error}` : ""}.
              </>
            ) : (
              " No sync has run yet."
            )}
          </div>
          <button
            type="button"
            className="admin-button shrink-0"
            disabled={syncing}
            onClick={() => void runRoleSync()}
          >
            {syncing ? "Syncing with Discord…" : "🔄 Sync now"}
          </button>
        </div>

        {status && <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">{status}</div>}

        <div>
          {presets.length > 1 && (
            <p className="mb-2 text-xs text-zinc-500">
              Order matters: top = shown first on cards and in pickers. Use ▲▼ to rearrange.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
          {presets.length ? presets.map((preset, index) => (
            <div
              key={preset.key}
              className={`flex items-center gap-1 rounded-full border px-2 py-2 text-sm ${editingKey === preset.key ? "ring-2 ring-emerald-400/50" : ""}`}
              style={{
                borderColor: `${preset.color}88`,
                background: `${preset.color}1f`,
              }}
            >
              <span className="flex flex-col">
                <button
                  type="button"
                  className="px-1 text-[9px] leading-none text-zinc-400 transition hover:text-white disabled:opacity-20"
                  disabled={loading || index === 0}
                  onClick={() => void movePreset(index, -1)}
                  aria-label={`Move ${preset.label} up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="px-1 text-[9px] leading-none text-zinc-400 transition hover:text-white disabled:opacity-20"
                  disabled={loading || index === presets.length - 1}
                  onClick={() => void movePreset(index, 1)}
                  aria-label={`Move ${preset.label} down`}
                >
                  ▼
                </button>
              </span>
              <span className="font-semibold" style={{ color: preset.color }}>
                {preset.emoji ? `${preset.emoji} ` : ""}{preset.label}
              </span>
              {preset.linkedDiscordRoleId && (
                <span
                  className="rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-bold text-zinc-300"
                  title={`${preset.linkedDiscordRoleName
                    ? `Auto-synced from the “${preset.linkedDiscordRoleName}” Discord role.`
                    : "Auto-synced from a Discord role."}${preset.exclusiveTier ? " ★ Tier badge: only the member's highest tier shows." : ""}`}
                >
                  🔗 {preset.linkedDiscordRoleName ?? "role"}{preset.exclusiveTier ? " ★" : ""}
                </span>
              )}
              <button
                type="button"
                className="rounded-full px-1.5 text-xs text-zinc-300 transition hover:bg-white/10"
                disabled={loading}
                onClick={() => startEdit(preset)}
                aria-label={`Edit ${preset.label}`}
                title={`Edit ${preset.label}`}
              >
                ✎
              </button>
              <button
                type="button"
                className="rounded-full px-1.5 text-xs text-zinc-300 transition hover:bg-white/10"
                disabled={loading}
                onClick={() => void deletePreset(preset.key, preset.label)}
                aria-label={`Delete ${preset.label}`}
                title={`Delete ${preset.label}`}
              >
                ×
              </button>
            </div>
          )) : (
            <p className="text-sm text-zinc-500">No badge presets yet. Add one above to start assigning badges.</p>
          )}
          </div>
        </div>
      </div>
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
      {isOwner && <div className="xl:col-span-2"><BadgePresetManager /></div>}
    </div>
  );
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="shine-sweep card-hover rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-3 text-3xl font-bold">
        {value}{value !== "—" && suffix ? <span className="ml-1 text-base text-zinc-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="card-hover rounded-2xl border border-white/10 bg-white/5 p-4">
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
          <div
            key={safeId("activity", item.id, index)}
            className="row-lift stagger-in rounded-2xl border border-white/10 bg-black/20 p-4"
            style={{ "--i": Math.min(index, 10) } as CSSProperties}
          >            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
