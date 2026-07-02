"use client";

import { useEffect, useState } from "react";

type Player = {
  user_id: number;
  name: string;
  points: number;
};

interface PodiumProps {
  players: Player[];
}

type AvatarProps = {
  userId?: number;
  name: string;
  sizeClass: string;
  borderClass: string;
  textClass: string;
  placeholder: string;
};

function RobloxAvatar({
  userId,
  name,
  sizeClass,
  borderClass,
  textClass,
  placeholder,
}: AvatarProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAvatar() {
      if (!userId) {
        setSrc(null);
        setLoaded(true);
        return;
      }

      try {
        setLoaded(false);
        setSrc(null);

        const res = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=true`
        );

        if (!res.ok) throw new Error("Failed to load Roblox thumbnail");

        const data = await res.json();
        const entry = Array.isArray(data?.data)
          ? data.data.find(
              (item: any) => String(item?.targetId) === String(userId)
            ) ?? data.data[0]
          : null;

        const imageUrl = entry?.imageUrl ?? null;

        if (!cancelled) {
          setSrc(imageUrl);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setSrc(null);
          setLoaded(true);
        }
      }
    }

    loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fallbackText =
    loaded && name ? name.trim().charAt(0).toUpperCase() : placeholder;

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full ${sizeClass} ${borderClass}`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`select-none font-bold ${textClass}`}>
          {fallbackText}
        </span>
      )}
    </div>
  );
}

export default function Podium({ players }: PodiumProps) {
  const first = players[0];
  const second = players[1];
  const third = players[2];

  return (
    <section className="mx-auto mt-16 max-w-5xl px-4">
      <h2 className="mb-10 text-center text-3xl font-bold">
        🏆 Top Performers
      </h2>

      <div className="flex items-end justify-center gap-8">
        {/* 🥈 SECOND */}
        <div className="flex w-40 flex-col items-center">
          <RobloxAvatar
            userId={second?.user_id}
            name={second?.name ?? ""}
            placeholder="🥈"
            sizeClass="h-16 w-16"
            borderClass="border-2 border-zinc-400 bg-zinc-800 shadow-md"
            textClass="text-xl text-zinc-200"
          />

          <p className="mt-3 font-semibold text-zinc-200">
            {second?.name ?? "---"}
          </p>

          <p className="text-sm text-zinc-400">
            {second?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-36 w-full rounded-t-2xl bg-gradient-to-t from-zinc-700/70 to-zinc-500/20 shadow-inner" />
        </div>

        {/* 👑 FIRST */}
        <div className="flex w-44 flex-col items-center">
          <RobloxAvatar
            userId={first?.user_id}
            name={first?.name ?? ""}
            placeholder="👑"
            sizeClass="h-20 w-20"
            borderClass="border-4 border-yellow-400 bg-yellow-500/10 shadow-[0_0_25px_rgba(234,179,8,0.3)]"
            textClass="text-2xl text-yellow-100"
          />

          <p className="mt-3 text-lg font-bold text-white">
            {first?.name ?? "---"}
          </p>

          <p className="text-yellow-300">
            {first?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-52 w-full rounded-t-2xl bg-gradient-to-t from-yellow-600/40 via-yellow-400/20 to-transparent shadow-lg shadow-yellow-500/20" />
        </div>

        {/* 🥉 THIRD */}
        <div className="flex w-40 flex-col items-center">
          <RobloxAvatar
            userId={third?.user_id}
            name={third?.name ?? ""}
            placeholder="🥉"
            sizeClass="h-16 w-16"
            borderClass="border-2 border-orange-500 bg-orange-500/10 shadow-md"
            textClass="text-xl text-orange-100"
          />

          <p className="mt-3 font-semibold text-zinc-200">
            {third?.name ?? "---"}
          </p>

          <p className="text-sm text-zinc-400">
            {third?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-32 w-full rounded-t-2xl bg-gradient-to-t from-orange-900/60 to-orange-500/10 shadow-inner" />
        </div>
      </div>
    </section>
  );
}
