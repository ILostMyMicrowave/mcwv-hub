type Player = {
  user_id: number;
  name: string;
  points: number;
};

interface PodiumProps {
  players: Player[];
}

function getAvatar(userId: number) {
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`;
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
          <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-zinc-400 bg-zinc-800">
            {second?.user_id ? (
              <img
                src={getAvatar(second.user_id)}
                alt={second.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl">
                🥈
              </div>
            )}
          </div>

          <p className="mt-3 font-semibold text-zinc-200">
            {second?.name ?? "---"}
          </p>

          <p className="text-sm text-zinc-400">
            {second?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-36 w-full rounded-t-2xl bg-gradient-to-t from-zinc-700/70 to-zinc-500/20" />
        </div>

        {/* 👑 FIRST */}
        <div className="flex w-44 flex-col items-center">
          <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-yellow-400 bg-yellow-500/10 shadow-[0_0_25px_rgba(234,179,8,0.3)]">
            {first?.user_id ? (
              <img
                src={getAvatar(first.user_id)}
                alt={first.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">
                👑
              </div>
            )}
          </div>

          <p className="mt-3 text-lg font-bold text-white">
            {first?.name ?? "---"}
          </p>

          <p className="text-yellow-300">
            {first?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-52 w-full rounded-t-2xl bg-gradient-to-t from-yellow-600/40 via-yellow-400/20 to-transparent" />
        </div>

        {/* 🥉 THIRD */}
        <div className="flex w-40 flex-col items-center">
          <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-orange-500 bg-orange-500/10">
            {third?.user_id ? (
              <img
                src={getAvatar(third.user_id)}
                alt={third.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl">
                🥉
              </div>
            )}
          </div>

          <p className="mt-3 font-semibold text-zinc-200">
            {third?.name ?? "---"}
          </p>

          <p className="text-sm text-zinc-400">
            {third?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-32 w-full rounded-t-2xl bg-gradient-to-t from-orange-900/60 to-orange-500/10" />
        </div>

      </div>
    </section>
  );
}
