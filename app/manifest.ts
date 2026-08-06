import type { MetadataRoute } from "next";

// Installable-app manifest ("Add to Home Screen" on Android/iOS).
// No service worker caching on purpose: pages are session-authenticated, so
// caching them for offline would be a footgun, not a feature. (public/
// push-sw.js is push-only and registers only after a user opts in.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MCWV Hub",
    short_name: "MCWV",
    description: "MCWV clan hub — war stats, leaderboards, achievements.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["games", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press / right-click jump list on the installed icon.
    shortcuts: [
      {
        name: "Leaderboard",
        short_name: "Leaderboard",
        url: "/leaderboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "War Analyst",
        short_name: "War Analyst",
        url: "/war-analyst",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Hall of Fame",
        short_name: "Hall of Fame",
        url: "/hall-of-fame",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Admin",
        short_name: "Admin",
        url: "/admin",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
    // Richer install UI (Chrome Android/desktop shows these in the prompt).
    // Stylized previews — swap for real app screenshots any time.
    screenshots: [
      {
        src: "/screenshots/hub-wide.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "MCWV Hub — clan HQ",
      },
      {
        src: "/screenshots/hub-mobile.png",
        sizes: "1170x2532",
        type: "image/png",
        form_factor: "narrow",
        label: "Leaderboard on the go",
      },
    ],
  };
}
