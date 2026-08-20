export const metadata = { title: "Privacy Policy · MCWV" };

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#070b1a 0%,#0c1130 55%,#150b2e 100%)",
        color: "#e5e7f5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "3rem 1.25rem 5rem",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ marginBottom: 40, textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: "#7f88b8", textTransform: "uppercase" }}>
            MCWV · Forged For War
          </div>
          <h1 style={{ fontSize: 34, margin: "8px 0 6px", fontWeight: 800 }}>Privacy Policy</h1>
          <div style={{ fontSize: 13, color: "#8d94b5" }}>Last updated: 20 August 2026</div>
        </header>

        <Section title="What MCWV is">
          <p>
            MCWV is an unofficial Discord bot and companion website built by and for the{" "}
            <strong>MCWV</strong> Pet Simulator 99 clan. It is not affiliated with, endorsed by, or
            operated by Roblox Corporation, Big Games, or Discord Inc.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>Only what the bot and website need to run the clan.</p>
          <Bullet>
            <strong>Discord account data</strong> — your Discord user ID, username, and server roles,
            visible to the bot because it operates in the MCWV Discord server.
          </Bullet>
          <Bullet>
            <strong>Roblox account data</strong> — your Roblox user ID, username, and in-game
            clan/battle statistics, sourced from public APIs for roster members.
          </Bullet>
          <Bullet>
            <strong>PS99 data via BIG Games (with your consent)</strong> — when you authorise the{" "}
            <strong>MCWV Bot</strong> app, we read your Pet Simulator 99 profile, inventory, and
            gamepass data so we can verify your application. We only request scopes we actually use.
          </Bullet>
          <Bullet>
            <strong>Application &amp; ticket data</strong> — answers you submit when applying
            (Roblox username, activity, gems, screenshots) used to review your application.
          </Bullet>
          <Bullet>
            <strong>Points, donations &amp; war records</strong> — linked to Discord/Roblox accounts
            for leaderboards and clan management.
          </Bullet>
        </Section>

        <Section title="How we use this">
          <p>
            We use this information to display clan rosters and statistics, verify membership, track
            war points and donations, run leaderboards, and moderate applications and tickets.
          </p>
        </Section>

        <Section title="Sharing">
          <p>
            We do <strong>not sell</strong> your information. It is shared only with services
            necessary to operate MCWV (Discord, Roblox, Big Games, Vercel, and Supabase) and with
            clan officers for moderation.
          </p>
        </Section>

        <Section title="BIG Games / PS99 access">
          <p>
            Accessing your PS99 data requires you to explicitly authorise the MCWV Bot app on a
            BIG&nbsp;Games consent screen. You can revoke that access at any time in your BIG Games
            account. When you revoke:
          </p>
          <Bullet>We stop using your PS99 data.</Bullet>
          <Bullet>We delete derived caches within 7 days.</Bullet>
          <Bullet>Cached PS99 data is generally retained no more than 30 days after a grant ends.</Bullet>
        </Section>

        <Section title="Cookies">
          <p>
            Logging into the website sets a secure, signed session cookie so you stay signed in. We
            do not use advertising or tracking cookies.
          </p>
        </Section>

        <Section title="Retention &amp; removal">
          <p>
            Data is retained while you are associated with the clan or its roster history. To review,
            correct, or remove data, contact any MCWV officer in the Discord server or{" "}
            <strong>@ilostmymicrowave</strong>.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            MCWV is not directed at children under 13. If you believe a child has provided us
            information, contact us and we will remove it.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update this policy as the bot and website evolve. Material changes will be
            reflected here with an updated date.
          </p>
        </Section>

        <FooterContact />
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2
        style={{
          fontSize: 19,
          fontWeight: 700,
          color: "#9fb0ff",
          margin: "0 0 8px",
          borderLeft: "3px solid #5d6fff",
          paddingLeft: 12,
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: "#c7cde6" }}>{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "8px 0 8px 16px", paddingLeft: 8, position: "relative" }}>
      <span style={{ position: "absolute", left: -10, color: "#5d6fff" }}>•</span>
      {children}
    </div>
  );
}

function FooterContact() {
  return (
    <div
      style={{
        marginTop: 40,
        padding: "22px 24px",
        borderRadius: 14,
        background: "rgba(30,38,80,.55)",
        border: "1px solid rgba(120,135,220,.35)",
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Questions about your data?</div>
      <div style={{ fontSize: 14.5, color: "#b9c0dd", lineHeight: 1.6 }}>
        Reach any MCWV officer in the Discord server, or message <strong>@ilostmymicrowave</strong>.
        We'll help review or remove what we hold.
      </div>
    </div>
  );
}
