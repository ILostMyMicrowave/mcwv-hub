async function getData() {
  const res = await fetch("/api/leaderboard", { cache: "no-store" });
  return res.json();
}

export default async function Leaderboard() {
  const data = await getData();

  return (
    <main style={{ padding: 40 }}>
      <h1>🏆 MCWV Leaderboard</h1>

      {data.map((user: any, i: number) => (
        <div key={i}>
          #{i + 1} {user.name} — {user.points}
        </div>
      ))}
    </main>
  );
}
