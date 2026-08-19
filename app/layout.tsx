import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserSync from "@/components/UserSync";
import OnboardingTour from "@/components/OnboardingTour";
import WarReturnRecap from "@/components/WarReturnRecap";
import BootIntroGate from "@/components/BootIntroGate";
import GlobalAssistant from "@/components/GlobalAssistant";
import AppBadgeSync from "@/components/AppBadgeSync";
import InstallBanner from "@/components/InstallBanner";

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
    // Launch splash screens for the installed iOS app (Safari reads
    // apple-touch-startup-image links; one per device class).
    startupImage: [
      {
        url: "/splash/ios-430x932.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-393x852.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-428x926.png",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-390x844.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-375x812.png",
        media:
          "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-414x896-3x.png",
        media:
          "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-414x896-2x.png",
        media:
          "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        url: "/splash/ios-375x667.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Full-bleed on notched devices when installed (safe areas handled in CSS).
  viewportFit: "cover",
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
        {/* Capture Chromium's one-shot install event before React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                if (window.__mcwvInstallCaptureReady) return;
                window.__mcwvInstallCaptureReady = true;

                window.addEventListener("beforeinstallprompt", (event) => {
                  event.preventDefault();
                  window.__mcwvDeferredInstallPrompt = event;
                  window.dispatchEvent(new Event("mcwv-install-ready"));
                });

                window.addEventListener("appinstalled", () => {
                  window.__mcwvAppInstalled = true;
                  window.__mcwvDeferredInstallPrompt = null;
                  window.dispatchEvent(new Event("mcwv-app-installed"));
                });
              })();
            `,
          }}
        />
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
        <AppBadgeSync />
        {children}
        <GlobalAssistant />
        <InstallBanner />
        <OnboardingTour />
        <WarReturnRecap />
      </body>
    </html>
  );
}
