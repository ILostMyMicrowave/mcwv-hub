import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer
      style={{
        marginTop: "auto",
        borderTop: "1px solid rgba(120,135,220,.18)",
        background: "rgba(7,11,26,.9)",
        padding: "18px 24px",
        color: "#8d94b5",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap" }}>
        <Link
          href="/privacy"
          style={{ color: "#b9c0dd", textDecoration: "none", fontWeight: 600 }}
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          style={{ color: "#b9c0dd", textDecoration: "none", fontWeight: 600 }}
        >
          Terms of Service
        </Link>
      </div>
      <div style={{ lineHeight: 1.6 }}>
        ⚔ FORGED FOR WAR · MCWV HUB
        <br />
        Unofficial fan project for the MCWV Pet Simulator 99 clan. Not affiliated with Roblox
        Corporation, Big Games, or Discord Inc.
      </div>
    </footer>
  );
}
