export default function Home() {
  return (
    <main style={{ fontFamily: "Arial" }}>
      
      {/* NAVBAR */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "20px 40px",
        borderBottom: "1px solid #ddd"
      }}>
        <h2>⚔️ MCWV</h2>

        <div style={{ display: "flex", gap: 20 }}>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/profile">Profile</a>
          <a href="/dashboard">Dashboard</a>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ padding: 40 }}>
        <h1>MCWV Clan Hub</h1>
        <p>Welcome to the official MCWV system</p>

        <div style={{ marginTop: 30 }}>
          <h2>📊 Features</h2>
          <ul>
            <li>Live Leaderboard</li>
            <li>Player Profiles</li>
            <li>Clan War Tracking</li>
            <li>Events System</li>
          </ul>
        </div>

        <div style={{ marginTop: 30 }}>
          <p>🔗 Connected to Discord Bot</p>
          <p>🗄 Powered by Neon Database (later)</p>
        </div>
      </div>
    </main>
  );
}
