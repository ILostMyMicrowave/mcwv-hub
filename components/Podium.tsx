type Player = {
  user_id: number;
  name: string;
  points: number;
};

interface PodiumProps {
  players: Player[];
}

export default function Podium({ players }: PodiumProps) {
  const first = players[0];
  const second = players[1];
  const third = players[2];

  return (
    <section className="mx-auto mt-12 max-w-5xl px-4">
      <h2 className="mb-8 text-center text-3xl font-bold">
        🏆 Top Performers
      </h2>

      <div className="flex items-end justify-center gap-6">

        {/* 2nd */}
        <div className="flex w-40 flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-400 bg-zinc-800 text-2xl">
            🥈
          </div>

          <p className="font-semibold">{second?.name ?? "---"}</p>
          <p className="text-sm text-zinc-400">
            {second?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-36 w-full rounded-t-2xl bg-zinc-700" />
        </div>

        {/* 1st */}
        <div className="flex w-44 flex-col items-center">
          <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full border-2 border-yellow-400 bg-yellow-500/10 text-3xl shadow-lg shadow-yellow-500/30">
            👑
          </div>

          <p className="text-lg font-bold">{first?.name ?? "---"}</p>
          <p className="text-yellow-300">
            {first?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-52 w-full rounded-t-2xl border border-yellow-400/30 bg-gradient-to-t from-yellow-600/40 to-yellow-300/20" />
        </div>

        {/* 3rd */}
        <div className="flex w-40 flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/10 text-2xl">
            🥉
          </div>

          <p className="font-semibold">{third?.name ?? "---"}</p>
          <p className="text-sm text-zinc-400">
            {third?.points?.toLocaleString() ?? 0}
          </p>

          <div className="mt-4 h-28 w-full rounded-t-2xl bg-orange-900/60" />
        </div>

      </div>
    </section>
  );
}
