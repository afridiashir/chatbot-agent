import webpush from "web-push";
import { prisma } from "@repo/db";
import type { Message } from "@repo/types";
import { env } from "../env.js";
import { describeAttachment } from "@repo/types";

/**
 * Web Push for people who are not looking at the chat: the visitor who closed
 * the hosted chat page, and later the agent whose dashboard is shut.
 *
 * Without VAPID keys nothing is sent and nothing breaks — the feature is off
 * until `deploy/deploy.sh push-keys` has put a pair in the server's .env.
 */
export const pushConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Remembers a browser, or refreshes the row it already has. */
export async function saveSubscription(
  subscription: SubscriptionInput,
  owner: { visitorId?: string; agentId?: string },
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      visitorId: owner.visitorId ?? null,
      agentId: owner.agentId ?? null,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      visitorId: owner.visitorId ?? null,
      agentId: owner.agentId ?? null,
      lastSeenAt: new Date(),
    },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string;
  /** Replaces an earlier notification for the same chat instead of stacking. */
  tag: string;
}

/**
 * Sends to every browser of one owner. A push service answering 404 or 410
 * means that browser is gone for good, so the row goes with it; anything else
 * is logged and left alone, since it may be a passing failure.
 */
async function sendTo(
  where: { visitorId?: string; agentId?: string },
  payload: PushPayload,
): Promise<void> {
  if (!pushConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: where.visitorId ? { visitorId: where.visitorId } : { agentId: where.agentId },
  });

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
          return;
        }
        console.error("[push] send failed", status ?? error);
      }
    }),
  );
}

/** A one-line preview: the text, or what kind of file it was. */
function preview(message: Message): string {
  if (message.content) return message.content.slice(0, 120);
  const attachment = message.attachment;
  return attachment ? describeAttachment(attachment.kind, attachment.durationMs) : "New message";
}

/**
 * The agent has answered someone who is no longer connected to the chat.
 * The link reopens their conversation on the hosted chat page.
 */
export async function pushToVisitor(
  visitorId: string,
  agentName: string,
  message: Message,
): Promise<void> {
  await sendTo(
    { visitorId },
    {
      title: agentName,
      body: preview(message),
      url: `${env.PUBLIC_CHAT_URL}?conversation=${message.conversationId}`,
      tag: `chat-${message.conversationId}`,
    },
  );
}
