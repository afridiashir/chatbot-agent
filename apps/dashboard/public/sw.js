/*
 * Service worker for the agent inbox.
 *
 * Its only job is notifications: a push can only be shown by a service worker,
 * and a service worker must come from the page's own domain. It caches
 * nothing — the inbox is live data and a stale copy would mislead.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with no readable body still deserves a notification.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "New message", {
      body: payload.body || "",
      // One notification per conversation rather than a growing column.
      tag: payload.tag || "chat",
      renotify: true,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  // Focus the inbox if it is already open somewhere, rather than opening a
  // second copy of it.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
