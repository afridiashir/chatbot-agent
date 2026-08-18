import { Prisma, prisma } from "@repo/db";
import type {
  AssignmentResult,
  Conversation,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  Message,
} from "@repo/types";
import type { CreateConversationBody, CreateMessageBody } from "@repo/validation";
import type { Actor } from "../lib/actor.js";
import { conflict, forbidden, notFound } from "../lib/http.js";
import {
  toConversation,
  toConversationDetail,
  toConversationSummary,
  toMessage,
} from "../lib/serialize.js";
import { assignAgent } from "./routing.js";

/** Oldest first, with `id` as a stable tie-break for identical timestamps. */
const MESSAGE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

export function createConversation(input: CreateConversationBody): Promise<AssignmentResult> {
  return assignAgent(input);
}

function assertAccess(
  conversation: { agentId: string; visitorId: string },
  actor: Actor,
): void {
  // Admin company scoping is enforced by the admin service, which loads the
  // branch alongside the conversation; here an admin simply is not the wrong
  // party for any conversation.
  const allowed =
    actor.type === "ADMIN" ||
    (actor.type === "AGENT"
      ? conversation.agentId === actor.agentId
      : conversation.visitorId === actor.visitorId);

  if (!allowed) throw forbidden("This conversation belongs to someone else");
}

/**
 * Cheap ownership check for socket room joins — avoids loading the whole
 * transcript just to decide whether the caller may listen.
 */
export async function assertConversationAccess(
  conversationId: string,
  actor: Actor,
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { agentId: true, visitorId: true },
  });
  if (!conversation) throw notFound("Conversation not found");

  assertAccess(conversation, actor);
}

export async function getConversation(
  conversationId: string,
  actor: Actor,
): Promise<ConversationDetail> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { agent: true, visitor: true, messages: { orderBy: [...MESSAGE_ORDER] } },
  });
  if (!conversation) throw notFound("Conversation not found");

  assertAccess(conversation, actor);
  return toConversationDetail(conversation);
}

/**
 * Persists a message. Messages are written here rather than in the socket
 * handler so that PostgreSQL, not Socket.IO, is the record of what was said.
 *
 * When the caller supplies a `clientId` the write is idempotent: a message
 * queued while offline and retried after reconnecting resolves to the row that
 * was already stored. `created` tells the caller whether anything new
 * happened, so a retry does not re-broadcast.
 */
export async function addMessage(
  conversationId: string,
  input: CreateMessageBody,
  actor: Actor,
): Promise<{ message: Message; created: boolean }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, agentId: true, visitorId: true, status: true },
  });
  if (!conversation) throw notFound("Conversation not found");

  assertAccess(conversation, actor);

  // Nobody may speak as the other party.
  const expectedSender = actor.type === "AGENT" ? "AGENT" : "VISITOR";
  if (input.senderType !== expectedSender) {
    throw forbidden(`You can only send messages as ${expectedSender}`);
  }

  // Checked before the CLOSED guard: a message that was accepted while the
  // conversation was open must still resolve after it closes, otherwise a
  // reconnecting client retries forever against a 409.
  if (input.clientId) {
    const existing = await prisma.message.findUnique({ where: { clientId: input.clientId } });
    if (existing) {
      if (existing.conversationId !== conversationId) {
        throw conflict("That message key belongs to another conversation");
      }
      return { message: toMessage(existing), created: false };
    }
  }

  if (conversation.status === "CLOSED") {
    throw conflict("This conversation has been closed");
  }

  // Bumping the conversation keeps `updatedAt` meaningful as "last activity",
  // which is what the agent inbox sorts on.
  try {
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          senderType: input.senderType,
          content: input.content,
          clientId: input.clientId ?? null,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return { message: toMessage(message), created: true };
  } catch (error) {
    // Two retries can race past the lookup above and reach the insert together.
    // The unique index settles it; the loser reads back the winner's row.
    if (
      input.clientId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const stored = await prisma.message.findUnique({ where: { clientId: input.clientId } });
      if (stored) return { message: toMessage(stored), created: false };
    }
    throw error;
  }
}

/**
 * ACTIVE -> CLOSED. Idempotent: closing an already-closed conversation returns
 * it untouched rather than erroring or moving `closedAt`.
 */
export async function closeConversation(
  conversationId: string,
  actor: Actor,
): Promise<Conversation> {
  if (actor.type !== "AGENT") {
    throw forbidden("Only the assigned agent can close a conversation");
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw notFound("Conversation not found");

  assertAccess(conversation, actor);

  if (conversation.status === "CLOSED") return toConversation(conversation);

  const closed = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  return toConversation(closed);
}

/** The agent inbox: most recently active first. */
export async function listAgentConversations(
  agentId: string,
  status: ConversationStatus | undefined,
  actor: Actor,
): Promise<ConversationSummary[]> {
  if (actor.type !== "AGENT" || actor.agentId !== agentId) {
    throw forbidden("You can only list your own conversations");
  }

  const rows = await prisma.conversation.findMany({
    where: { agentId, ...(status ? { status } : {}) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: {
      visitor: true,
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      _count: { select: { messages: true } },
    },
  });

  return rows.map(toConversationSummary);
}
