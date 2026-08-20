export const metadata = { title: "Terms of Service · MCWV" };

export default function TermsPage() {
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
          <h1 style={{ fontSize: 34, margin: "8px 0 6px", fontWeight: 800 }}>Terms of Service</h1>
          <div style={{ fontSize: 13, color: "#8d94b5" }}>Last updated: 20 August 2026</div>
        </header>

        <Section title="Acceptance">
          <p>
            By using the MCWV Discord bot, the MCWV website, or authorising the MCWV Bot app, you
            agree to these terms. If you do not agree, do not use these services.
          </p>
        </Section>

        <Section title="What MCWV is">
          <p>
            MCWV is an unofficial, community-run Discord bot and companion website for a Pet
            Simulator 99 clan. It is <strong>not</strong> affiliated with Roblox Corporation, Big
            Games, or Discord Inc. It is provided by volunteer clan members, not a company.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>Keep the clan fun and fair. Break these and officers step in.</p>
          <Bullet>
            <strong>No impersonation</strong> — do not impersonate another member, officer, or
            Roblox/Discord account.
          </Bullet>
          <Bullet>
            <strong>No abuse</strong> — do not attempt to abuse, exploit, scrape, or overload the bot
            or website.
          </Bullet>
          <Bullet>
            <strong>Platform terms first</strong> — follow Discord's, Roblox's, and Big Games' own
            Terms of Service at all times. These terms do not override them.
          </Bullet>
        </Section>

        <Section title="Account linking &amp; authorisation">
          <p>
            Some features require your Discord account to be linked to a Roblox account (verified by
            an officer). To apply for MCWV, you must authorise the <strong>MCWV Bot</strong> app on
            BIG Games so we can verify your profile. You can revoke this at any time.
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            MCWV is provided "as is," run by volunteers in their spare time. We do not guarantee
            uptime, the accuracy of displayed statistics, or uninterrupted service.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may change, suspend, or discontinue any part of the bot or website at any time.
            Continued use after a terms update means you accept the update.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            Clan officers may remove your roles, revoke access, or remove customisation at their
            discretion, consistent with clan rules and Discord's Terms of Service.
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
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Questions about these terms?</div>
      <div style={{ fontSize: 14.5, color: "#b9c0dd", lineHeight: 1.6 }}>
        Reach any MCWV officer in the Discord server, or message <strong>@ilostmymicrowave</strong>.
        We'll clarify how clan rules apply.
      </div>
    </div>
  );
}
