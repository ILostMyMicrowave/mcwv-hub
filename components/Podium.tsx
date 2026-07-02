type Player = {
  user_id: number;
  name: string;
  points: number;
  avatar: string | null;
};

interface PodiumProps {
  players: Player[];
}

export default function Podium({ players }: PodiumProps) {
  const first = players[0];
  const second = players[1];
  const third = players[2];

  return (
    <section className="mx-auto mt-16 max-w-5xl px-4">
      <h2 className="mb-10 text-center text-3xl font-bold text-white">
        🏆 Top Performers
      </h2>

      <div className="flex items-end justify-center gap-8">

        {/* 🥈 SECOND (SILVER) */}
        <div className="flex w-40 flex-col items-center">
          <div
            className="h-16 w-16 overflow-hidden rounded-full border-2 bg-zinc-800"
            style={{
              borderColor: "#c0c0c0",
            }}
          >
            {second?.avatar ? (
              <img
                src={second.avatar}
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

          <div
            className="mt-4 h-36 w-full rounded-t-2xl"
            style={{
              background:
                "linear-gradient(to top, rgba(192,192,192,0.35), transparent)",
            }}
          />
        </div>

        {/* 👑 FIRST (GOLD) */}
        <div className="flex w-44 flex-col items-center">
          <div
            className="h-20 w-20 overflow-hidden rounded-full border-4 bg-yellow-500/10"
            style={{
              borderColor: "#ffd700",
              boxShadow: "0 0 25px var(--podium-gold-glow)",
            }}
          >
            {first?.avatar ? (
              <img
                src={first.avatar}
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

          <div
            className="mt-4 h-52 w-full rounded-t-2xl"
            style={{
              background:
                "linear-gradient(to top, rgba(255, 215, 0, 0.35), transparent)",
            }}
          />
        </div>

        {/* 🥉 THIRD (BRONZE) */}
        <div className="flex w-40 flex-col items-center">
          <div
            className="h-16 w-16 overflow-hidden rounded-full border-2 bg-orange-500/10"
            style={{
              borderColor: "#cd7f32",
            }}
          >
            {third?.avatar ? (
              <img
                src={third.avatar}
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

          <div
            className="mt-4 h-32 w-full rounded-t-2xl"
            style={{
              background:
                "linear-gradient(to top, rgba(205,127,50,0.35), transparent)",
            }}
          />
        </div>

      </div>
    </section>
  );
}
