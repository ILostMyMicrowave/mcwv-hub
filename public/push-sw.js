/* MCWV Hub — push service worker.
 *
 * PUSH ONLY, ON PURPOSE: there is deliberately no `fetch` handler here, so
 * nothing is ever cached for offline use. Pages are session-authenticated —
// caching them would be a footgun. This worker does exactly two things:
 *   1. Receive push events and show a notification.
 *   2. On tap, focus the app and navigate to the right page.
 */

// Take over immediately on deploy — without these, an updated worker WAITS
// until every app window is closed, so fixes (like a new badge icon) appear
// to "not work" while the old worker keeps handling pushes.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "MCWV Hub";
  const options = {
    body: data.body || "",
    // Large icon (expanded notification): full artwork.
    icon: "/icons/icon-512.png",
    // Status-bar badge: Android alpha-MASKS this one — opaque pixels become
    // a solid block, so it must be a mono alpha silhouette, never artwork.
    badge: "/icons/badge-96.png",
    tag: data.tag || "mcwv",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find((client) => "focus" in client);
        if (existing) {
          await existing.focus();
          if ("navigate" in existing) {
            try {
              await existing.navigate(url);
            } catch {
              /* already focused is good enough */
            }
          }
          return undefined;
        }
        return self.clients.openWindow(url);
      })
  );
});
