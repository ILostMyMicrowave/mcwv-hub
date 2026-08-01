import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserSync from "@/components/UserSync";
import OnboardingTour from "@/components/OnboardingTour";
import WarReturnRecap from "@/components/WarReturnRecap";
import BootIntroGate from "@/components/BootIntroGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MCWV HUB",
  description: "MCWV clan hub, leaderboard, stats, and updates.",
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
        {/* Hide the boot intro pre-paint when it already played this session */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (sessionStorage.getItem("mcwv_intro_seen_v1") === "1") {
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
        <OnboardingTour />
        <WarReturnRecap />
      </body>
    </html>
  );
}
