"use client";

import { useEffect, useState } from "react";

export default function Leaderboard() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(res => setData(res.data || []));
  }, []);

  return (
    <main style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>🏆 MCWV Leaderboard</h1>

      <p style={{ opacity: 0.6 }}>Source: mock database</p>

      <div style={{ marginTop: 20 }}>
        {data.map((user, i) => (
          <div key={user.id || i}>
            #{i + 1} {user.name} — {user.points}
          </div>
        ))}
      </div>
    </main>
  );
}
