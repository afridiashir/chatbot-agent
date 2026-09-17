import { apiFetch } from "./api.js";

const ASKED_KEY = "acme-chat-push-asked";

/** Notifications while the page is open, which any site can do. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Asks for permission alone, for sites where a service worker is impossible. */
export async function enableForegroundNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  return (await Notification.requestPermission()) === "granted";
}

/**
 * Shows the agent's reply when the visitor is looking at another tab. Nothing
 * is shown while the chat is on screen — they can already see it — and this is
 * all an embedded widget can do, since a service worker would have to be
 * served by the client's own domain.
 */
export function notifyInBackground(title: string, body: string, tag: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    const notification = new Notification(title, { body, tag });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Android Chrome only allows notifications from a service worker, which an
    // embedded widget has no way to register. The chat still updates itself.
  }
}

/** Whether this browser can do Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True once the visitor has answered the question, however they answered. */
export function pushAsked(): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberAsked(): void {
  try {
    window.localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Storage blocked: the offer may appear again next time, which is fine.
  }
}

/** The key arrives base64url-encoded; the browser wants the raw bytes. */
function toBytes(base64url: string): ArrayBuffer {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Asks the browser for permission, subscribes, and tells the API which browser
 * to notify. Returns false when push is unavailable, refused, or not
 * configured on the server — all ordinary outcomes, none of them errors.
 */
export async function enablePush(apiUrl: string, visitorId: string): Promise<boolean> {
  if (!pushSupported()) return false;

  const { publicKey } = await apiFetch<{ publicKey: string | null }>(apiUrl, "/api/push/key");
  if (!publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Chrome only allows subscriptions that will always show a notification.
      userVisibleOnly: true,
      applicationServerKey: toBytes(publicKey),
    }));

  await apiFetch(apiUrl, "/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription: subscription.toJSON(), visitorId }),
  });
  return true;
}
