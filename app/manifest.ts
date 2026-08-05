import type { MetadataRoute } from "next";

// Installable-app manifest ("Add to Home Screen" on Android/iOS).
// No service worker on purpose: pages are session-authenticated, so caching
// them for offline would be a footgun, not a feature.
export default function manifest(): MetadataRoute.Manifest {
  return {
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
  };
}
