import { prisma } from "@repo/db";
import type { ReceiptPayload, SenderType } from "@repo/types";

/**
 * Read receipts, as in WhatsApp: one tick once stored, two grey ticks once the
 * other side's app has the message, two blue ticks once they have looked at it.
 *
 * Receipts are always about the *other* side's messages: a visitor delivers or
 * reads the agent's, and the reverse. Admins only observe, so they never
 * produce receipts.
 */
export async function markReceipt(
  conversationId: string,
  reader: SenderType,
  status: ReceiptPayload["status"],
): Promise<ReceiptPayload | null> {
  const senderType: SenderType = reader === "AGENT" ? "VISITOR" : "AGENT";
  const at = new Date();
  const scope = { conversationId, senderType, createdAt: { lte: at } };

  // Reading implies delivery, so a message can never be blue but not grey.
  const delivered = await prisma.message.updateMany({
    where: { ...scope, deliveredAt: null },
    data: { deliveredAt: at },
  });
  const read =
    status === "READ"
      ? await prisma.message.updateMany({ where: { ...scope, readAt: null }, data: { readAt: at } })
      : { count: 0 };

  // Nothing changed means nothing to tell anyone; this keeps repeated reports
  // (every reconnect, every new message while open) from flooding the room.
  if (delivered.count === 0 && read.count === 0) return null;
  return {
    conversationId,
    senderType,
    status: read.count > 0 ? "READ" : "DELIVERED",
    at: at.toISOString(),
  };
}
