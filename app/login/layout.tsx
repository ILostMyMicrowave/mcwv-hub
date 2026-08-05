import type { Metadata } from "next";

// Public page — the one Discord's crawler actually reaches behind the auth
// proxy, so this is what renders when a hub link is pasted into chat.
export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to the MCWV clan hub — war stats, leaderboards, achievements.",
  openGraph: {
    title: "MCWV HUB — Sign In",
    description:
      "Clan HQ — war stats, leaderboards, achievements. Members only.",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
