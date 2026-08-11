"use client";

import { useEffect, useState } from "react";

type DiscordMember = {
  id: string;
  username: string;
  avatar?: string | null;
  discriminator?: string;
  game?: { name?: string } | null;
  status?: string;
  deaf?: boolean;
  mute?: boolean;
  self_deaf?: boolean;
  self_mute?: boolean;
  suppress?: boolean;
  channel_id?: string | null;
};

type DiscordChannel = {
  id: string;
  name: string;
  position: number;
};

type WidgetData = {
  success: boolean;
  id?: string;
  name?: string;
  instant_invite?: string | null;
  channels?: DiscordChannel[];
  members?: DiscordMember[];
  presence_count?: number;
  error?: string;
};

const STATUS_COLORS: Record<string, string> = {
  online: "#43b581",
  idle: "#faa61a",
  dnd: "#f04747",
};

export default function DiscordWidget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/discord-widget", { cache: "no-store" });
        if (!res.ok) {
          if (active) setLoading(false);
          return;
        }
        const json = await res.json();
        if (active) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  // ---------- Loading skeleton ----------
  if (loading) {
    return (
      <div className="rounded-2xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex-1">
            <div className="h-4 w-28 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="mt-1.5 h-3 w-20 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="h-9 w-9 animate-pulse rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="h-2 w-12 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Error state ----------
  if (!data?.success || !data.members) {
    return (
      <div className="rounded-2xl border p-5 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-2xl mb-2">💬</div>
        <p className="text-sm text-zinc-400">
          {data?.error === "Discord returned HTTP 403"
            ? "The Discord widget is disabled. Enable it in Server Settings → Widget."
            : "Couldn't load the Discord widget right now."}
        </p>
        {data?.instant_invite && (
          <a
            href={data.instant_invite}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-xl px-4 py-2 text-sm font-semibold transition hover:scale-[1.02]"
            style={{ background: "var(--primary)", color: "#000" }}
          >
            Join Discord →
          </a>
        )}
      </div>
    );
  }

  const members = data.members ?? [];
  const channels = (data.channels ?? []).sort((a, b) => a.position - b.position);
  const invite = data.instant_invite;

  // Group members by voice channel
  const channelMembers = new Map<string, DiscordMember[]>();
  const idleMembers: DiscordMember[] = [];
  for (const m of members) {
    if (m.channel_id) {
      const list = channelMembers.get(m.channel_id) ?? [];
      list.push(m);
      channelMembers.set(m.channel_id, list);
    } else {
      idleMembers.push(m);
    }
  }

  const avatarUrl = (m: DiscordMember) =>
    m.avatar
      ? `https://cdn.discordapp.com/widget-avatars/${m.id}/${m.avatar}.png?size=64`
      : null;

  const initials = (name: string) =>
    name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";

  const micIcon = (m: DiscordMember) => {
    if (m.suppress) return "🔇";
    if (m.self_mute || m.mute) return "🚫";
    return "🎙️";
  };

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        background: "color-mix(in srgb, var(--card) 85%, #5865F2 4%)",
        borderColor: "color-mix(in srgb, var(--border) 70%, rgba(88,101,242,0.25))",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{
          background: "linear-gradient(135deg, rgba(88,101,242,0.18) 0%, rgba(88,101,242,0.04) 100%)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-black"
            style={{
              background: "linear-gradient(135deg, #5865F2, #7c3aed)",
              boxShadow: "0 0 16px rgba(88,101,242,0.4)",
            }}
          >
            ⚔️
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">
              {data.name ?? "MCWV"} Discord
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {members.length} online
            </div>
          </div>
        </div>
        {invite && (
          <a
            href={invite}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition hover:scale-[1.03] active:scale-95"
            style={{
              background: "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, #5865F2))",
              color: "#000",
            }}
          >
            Join
          </a>
        )}
      </div>

      {/* Body */}
      <div className="max-h-[440px] overflow-y-auto px-4 py-4">
        {/* Voice channels */}
        {channels.length > 0 && (
          <div className="mb-4 space-y-2">
            {channels.map((ch) => {
              const occupants = channelMembers.get(ch.id) ?? [];
              if (occupants.length === 0) return null;
              return (
                <div
                  key={ch.id}
                  className="rounded-xl border px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                    <span style={{ color: "var(--accent)" }}>🔊</span>
                    <span className="truncate">{ch.name}</span>
                    <span className="ml-auto text-zinc-500">{occupants.length}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {occupants.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-zinc-300"
                        style={{ background: "rgba(255,255,255,0.04)" }}
                      >
                        {micIcon(m)}
                        {m.username}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Online members grid */}
        {idleMembers.length > 0 && (
          <div>
            {channels.length > 0 && (
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Online — not in voice
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {idleMembers.map((m) => {
                const url = avatarUrl(m);
                const dotColor = STATUS_COLORS[m.status ?? "online"] ?? "#43b581";
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white/5"
                  >
                    <div className="relative shrink-0">
                      {url ? (
                        <img
                          src={url}
                          alt={m.username}
                          width={32}
                          height={32}
                          className="rounded-full"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: "linear-gradient(135deg, #5865F2, #7c3aed)" }}
                        >
                          {initials(m.username)}
                        </div>
                      )}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
                        style={{ background: dotColor, borderColor: "var(--background)" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-zinc-200">
                        {m.username}
                      </div>
                      {m.game?.name && (
                        <div className="truncate text-[10px] text-zinc-500">
                          {m.game.name}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {members.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-zinc-400">No members online right now.</p>
            {invite && (
              <a
                href={invite}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-xl px-4 py-2 text-sm font-semibold transition hover:scale-[1.02]"
                style={{ background: "var(--primary)", color: "#000" }}
              >
                Be the first — Join Discord →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

