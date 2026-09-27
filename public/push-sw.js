/* MCWV Hub — push service worker.
 *
 * PUSH ONLY, ON PURPOSE: no `fetch` handler, nothing is ever cached offline.
 * Pages are session-authenticated — caching them would be a footgun.
 *
 * v5 reliability notes:
 *  - Click handling is openWindow-ONLY on purpose. The old focus()/
 *    navigate() juggling silently no-ops on some builds (WebAPK especially)
 *    and dumps the user on whatever page the app last had open.
 *  - SW_VERSION + the message handler let the settings page verify which
 *    worker is actually alive on the device (zombie-worker detector).
 *  - v7: reply on the transferred MessageChannel PORT (event.ports[0]) —
 *    v5/v6 answered via event.source, which lands on a channel the page
 *    never listened to, so the version check ALWAYS timed out and the
 *    "old worker" warning could never clear. Port first, source fallback.
 *  - v8: "kick" control messages (sign-out-everywhere v2). The kick push
 *    carries action:"kick" -> we postMessage every window client (pages
 *    bounce THEMSELVES — the one navigation path that is reliable on every
 *    build), best-effort client.navigate() as a bonus, and notify with a
 *    "Log back in" action so even a device with no open window lands on
 *    /login the moment it is tapped.
 */
const SW_VERSION = "8";

self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data !== "mcwv-version?") return;
  const reply = { type: "mcwv-version", version: SW_VERSION };
  try {
    const port = event.ports && event.ports.length > 0 ? event.ports[0] : null;
    if (port) {
      port.postMessage(reply); // page is waiting on its MessageChannel
      return;
    }
    if (event.source && "postMessage" in event.source) {
      event.source.postMessage(reply); // legacy caller, page-side fallback listens here too
    }
  } catch {
    /* diagnostics are best-effort */
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  // ---- v8: sign-out kick --------------------------------------------
  // Server has already revoked this device's session row; our only job is
  // to make that VISIBLE: bounce open pages, and for phones with no window
  // open, notify -> tap -> /login. data.sid = sid of the device that
  // PULLED THE TRIGGER (skip the bounce there; a stale worker may deliver
  // the kick to the revoker's own tabs otherwise).
  if (data.action === "kick") {
    event.waitUntil(
      (async () => {
        let clients = [];
        try {
          clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        } catch {
          /* no client access: the notification below still lands */
        }
        for (const client of clients) {
          try {
            client.postMessage({ type: "mcwv-kick", sid: data.sid ?? null });
          } catch {
            /* dead/frozen client - nothing to do */
          }
          try {
            const here = new URL(client.url || self.location.href);
            const onAuth = /\/(login|signup|forgot-password|reset-password)/.test(here.pathname);
            if (!onAuth) {
              // Bonus fast path; unreliable on some builds by design choice
              // (see header), so never depended upon.
              await client.navigate("/login?reason=signed-out");
            }
          } catch {
            /* uncontrolled client: navigate() throws - fine, message + notify cover it */
          }
        }
        await self.registration.showNotification(data.title || "Signed out of MCWV Hub", {
          body: data.body || "Your account was signed out from another device.",
          icon: "/icons/icon-512.png",
          badge: "/icons/badge-96.png",
          tag: "mcwv-kick",
          renotify: true,
          requireInteraction: true,
          data: { url: data.url || "/login?reason=signed-out" },
          actions: [{ action: "open", title: "Log back in" }],
        });
      })()
    );
    return;
  }
  // ---------------------------------------------------------------------

  const title = data.title || "MCWV Hub";
  const options = {
    body: data.body || "",
    // Large icon: full artwork. Status-bar badge: MUST be the mono alpha
    // silhouette (Android alpha-masks it; artwork becomes a white brick).
    icon: "/icons/icon-512.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || "mcwv",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/notifications", notifId: data.notifId ?? null },
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  // Big-picture style (Chrome Android/Windows) when the alert carries art.
  if (typeof data.image === "string" && data.image) {
    options.image = data.image;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const rawUrl =
    (event.notification.data && event.notification.data.url) ||
    "/notifications";
  // Absolute URL is non-negotiable: Chrome navigate/openWindow paths treat
  // relative URLs inconsistently across builds.
  const target = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(self.clients.openWindow(target));
});
