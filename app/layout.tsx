import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserSync from "@/components/UserSync";
import OnboardingTour from "@/components/OnboardingTour";
import WarReturnRecap from "@/components/WarReturnRecap";
import BootIntroGate from "@/components/BootIntroGate";
import GlobalAssistant from "@/components/GlobalAssistant";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcwv-hub.vercel.app"
  ),
  title: {
    default: "MCWV HUB",
    template: "%s · MCWV HUB",
  },
  description: "MCWV clan hub, leaderboard, stats, and updates.",
  openGraph: {
    title: "MCWV HUB",
    description: "Clan HQ — war stats, leaderboards, achievements.",
    siteName: "MCWV HUB",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: "MCWV HUB — War Mode Engaged",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MCWV HUB",
    description: "Clan HQ — war stats, leaderboards, achievements.",
    images: ["/og-card.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MCWV",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem("mcwv-theme");
                if (savedTheme) {
                  document.documentElement.setAttribute("data-theme", savedTheme);
                }
              } catch {}
            `,
          }}
        />
        {/* Hide the boot intro pre-paint when it already played on this device
            (localStorage) or in a legacy session still carrying the old flag */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (
                  localStorage.getItem("mcwv_intro_seen_v1") === "1" ||
                  sessionStorage.getItem("mcwv_intro_seen_v1") === "1"
                ) {
                  document.documentElement.setAttribute("data-intro-done", "1");
                }
              } catch {}
            `,
          }}
        />
        {/* Emblem must be painted instantly when the intro starts */}
        <link rel="preload" as="image" href="/mcwv-logo.png" />
      </head>

      <body className="min-h-full flex flex-col">
        <BootIntroGate />
        <UserSync />
        {children}
        <GlobalAssistant />
        <OnboardingTour />
        <WarReturnRecap />
      </body>
    </html>
  );
}
