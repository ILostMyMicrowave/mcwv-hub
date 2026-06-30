"use client";

import { useEffect, useState } from "react";

export default function Leaderboard() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <main style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>🏆 MCWV Leaderboard</h1>

      <div style={{ marginTop: 20 }}>
        {data.map((user, i) => (
          <div
            key={i}
            style={{
              padding: 10,
              marginBottom: 10,
              border: "1px solid #ddd",
              borderRadius: 8
            }}
          >
            <strong>#{i + 1}</strong> {user.name} — {user.points} pts
          </div>
        ))}
      </div>
    </main>
  );
}
