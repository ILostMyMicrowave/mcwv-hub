import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join MCWV",
  description:
    "Create your MCWV hub account — track war stats, leaderboard spots, and achievements.",
  openGraph: {
    title: "MCWV HUB — Join",
    description:
      "Clan HQ — war stats, leaderboards, achievements. Request your account.",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
  robots: { index: false, follow: false },
};

export default function SignupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
