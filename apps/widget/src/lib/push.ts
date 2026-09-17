import { apiFetch } from "./api.js";

const ASKED_KEY = "acme-chat-push-asked";

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
