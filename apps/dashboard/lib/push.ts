"use client";

import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";

const ENABLED_KEY = "mbca.push.enabled";

/** Whether this browser can do Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushEnabled(): boolean {
  try {
    return (
      window.localStorage.getItem(ENABLED_KEY) === "1" && Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

function remember(enabled: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Storage blocked: the toggle simply starts off again next time.
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
 * Asks permission, subscribes this browser and files it under the signed-in
 * agent. Returns a reason when it could not be turned on, so the inbox can say
 * why rather than silently doing nothing.
 */
export async function enablePush(
  token: string,
): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!pushSupported()) return { ok: false, why: "This browser cannot show notifications." };

  const { publicKey } = await api<{ publicKey: string | null }>("/api/push/key");
  if (!publicKey) {
    return { ok: false, why: "Notifications are not set up on the server yet." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      why:
        permission === "denied"
          ? "Notifications are blocked for this site in your browser settings."
          : "Notifications were not allowed.",
    };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Chrome only allows subscriptions that always show something.
      userVisibleOnly: true,
      applicationServerKey: toBytes(publicKey),
    }));

  await api("/api/push/agent/subscribe", {
    method: "POST",
    token,
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  remember(true);
  return { ok: true };
}

/** Stops this browser being pushed to, without touching the permission. */
export async function disablePush(): Promise<void> {
  remember(false);
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await api("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {
    // The row is stale rather than harmful if this never lands.
  });
  await subscription.unsubscribe();
}

/**
 * A notification for a tab that is open but hidden. The server does not push
 * then — the socket is connected, so it believes the agent is here — and this
 * covers the agent who is in another tab.
 */
export function notifyInBackground(title: string, body: string, tag: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    const notification = new Notification(title, { body, tag, icon: `${API_URL}/favicon.ico` });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the sound
    // has already played, so nothing more is needed here.
  }
}
