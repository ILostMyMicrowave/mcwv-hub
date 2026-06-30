async function getData() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/leaderboard`, {
    cache: "no-store"
  });

  return res.json();
}

export default async function Leaderboard() {
  let data = [];

  try {
    data = await getData();
  } catch (e) {
    console.log("Leaderboard fetch error:", e);
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>🏆 MCWV Leaderboard</h1>

      {data.length === 0 ? (
        <p>No data found</p>
      ) : (
        data.map((user: any, i: number) => (
          <div key={i}>
            #{i + 1} {user.name} — {user.points}
          </div>
        ))
      )}
    </main>
  );
}
