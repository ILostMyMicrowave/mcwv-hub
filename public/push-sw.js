/* MCWV Hub — push service worker.
 *
 * PUSH ONLY, ON PURPOSE: there is deliberately no `fetch` handler here, so
 * nothing is ever cached for offline use. Pages are session-authenticated —
// caching them would be a footgun. This worker does exactly two things:
 *   1. Receive push events and show a notification.
 *   2. On tap, focus the app and navigate to the right page.
 */
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
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
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
