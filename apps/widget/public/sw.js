/*
 * Service worker for the hosted chat page (https://API_DOMAIN/chat).
 *
 * It exists for one reason: a push notification can only be shown by a service
 * worker, and a service worker must be served by the page's own domain. Caddy
 * serves this file from the root so its scope covers /chat.
 *
 * It deliberately caches nothing. The chat needs the network anyway, and a
 * stale cached widget would be worse than no offline support.
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

  const title = payload.title || "New message";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      // One notification per chat: a new one replaces the last rather than
      // stacking up a column of them.
      tag: payload.tag || "chat",
      renotify: true,
      icon: "/chat-icon.png",
      badge: "/chat-icon.png",
      data: { url: payload.url || "/chat" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";

  // Reuse the tab the chat is already open in, wherever it has been scrolled
  // to, rather than opening a second copy of the conversation.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/chat") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
