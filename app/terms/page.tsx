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

        <Section num="1" title="Acceptance of Terms">
          <p>
            By accessing or using this website (the &quot;Service&quot;), you agree to comply with
            and be bound by these Terms of Service and our Privacy Policy. If you do not agree,
            please do not use the Service.
          </p>
        </Section>

        <Section num="2" title="Relationship to Roblox">
          <Bullet>
            <strong>Unofficial Service:</strong> This website is an independent third-party
            platform.
          </Bullet>
          <Bullet>
            <strong>No Endorsement:</strong> We are not affiliated with, endorsed by, sponsored by,
            or otherwise associated with Roblox Corporation.
          </Bullet>
          <Bullet>
            <strong>Trademark Ownership:</strong> &quot;Roblox&quot; and all associated logos, names,
            and assets are trademarks of Roblox Corporation.
          </Bullet>
        </Section>

        <Section num="3" title="Use of Roblox Data">
          <Bullet>
            <strong>API Usage:</strong> Our Service displays public data (such as player stats,
            profiles, assets, or analytics) retrieved via official Roblox APIs.
          </Bullet>
          <Bullet>
            <strong>Data Availability:</strong> We do not guarantee the accuracy, completeness, or
            real-time availability of this data. Roblox may change or restrict data access at any
            time, which may impact or disable features on our Service.
          </Bullet>
          <Bullet>
            <strong>No Data Ownership:</strong> We do not claim ownership over any Roblox data or
            intellectual property displayed on this site.
          </Bullet>
        </Section>

        <Section num="4" title="User Accounts and Security">
          <Bullet>
            <strong>Public Data Only:</strong> We do not request, collect, or store your Roblox
            account password.
          </Bullet>
          <Bullet>
            <strong>Account Security:</strong> You are solely responsible for maintaining the
            security of your own Roblox account. We are not liable for any losses or unauthorized
            access to your Roblox account.
          </Bullet>
        </Section>

        <Section num="5" title="Prohibited Conduct">
          <p>When using our Service, you agree <strong>NOT</strong> to:</p>
          <Bullet>
            <strong>Scrape Data:</strong> Automated extraction of data from this website without
            written permission is strictly prohibited.
          </Bullet>
          <Bullet>
            <strong>Exploit Data:</strong> Sell, rent, or commercially exploit any Roblox-derived
            data obtained through our platform.
          </Bullet>
          <Bullet>
            <strong>Impersonate:</strong> Falsely claim affiliation with Roblox Corporation or its
            staff.
          </Bullet>
          <Bullet>
            <strong>Disrupt:</strong> Interfere with the security or operation of the website.
          </Bullet>
        </Section>

        <Section num="6" title="Limitation of Liability">
          <p>
            The Service is provided on an &quot;as-is&quot; and &quot;as-available&quot; basis. To
            the maximum extent permitted by law, we disclaim all warranties and shall not be liable
            for any direct, indirect, incidental, or consequential damages resulting from your use
            of, or inability to use, our website or the displayed Roblox data.
          </p>
        </Section>

        <Section num="7" title="Termination">
          <p>
            We reserve the right to terminate or suspend your access to our Service immediately,
            without prior notice, for any conduct that we believe violates these Terms or harms
            other users.
          </p>
        </Section>

        <Section num="8" title="Changes to Terms">
          <p>
            We may update these Terms from time to time. Your continued use of the website after
            changes are posted constitutes your acceptance of the new Terms.
          </p>
        </Section>

        <FooterContact />
      </div>
    </main>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num?: string;
  title: string;
  children: React.ReactNode;
}) {
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
        {num ? `${num}. ` : ""}
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
