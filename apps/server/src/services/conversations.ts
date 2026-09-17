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
import { verifyUpload } from "./media.js";
import {
  MESSAGE_INCLUDE,
  toConversation,
  toConversationDetail,
  toConversationSummary,
  toMessage,
} from "../lib/serialize.js";
import { assignAgent } from "./routing.js";

/** Oldest first, with `id` as a stable tie-break for identical timestamps. */
const MESSAGE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

export async function createConversation(input: CreateConversationBody): Promise<AssignmentResult> {
  const { agentId, branchId, ...rest } = input;
  if (!agentId) return assignAgent({ ...rest, branchId: branchId! });

  // An agent link carries the agent; their branch is where the chat belongs.
  // A deactivated agent's link reads as missing, like any other dead link.
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { branchId: true, isActive: true },
  });
  if (!agent || !agent.isActive || (branchId && branchId !== agent.branchId)) {
    throw notFound("Agent not found");
  }
  return assignAgent({ ...rest, branchId: agent.branchId, preferredAgentId: agentId });
}

function assertAccess(
  conversation: {
    agentId: string;
    visitorId: string;
    agent: { branchId: string; branch: { companyId: string } };
  },
  actor: Actor,
): void {
  if (actor.type === "ADMIN") {
    // Admins read conversations in their own company, and a branch admin only
    // in their branch. Anything else is reported as missing, not forbidden, so
    // other companies' and branches' conversation ids cannot be probed.
    const inScope =
      conversation.agent.branch.companyId === actor.companyId &&
      (actor.branchId === null || conversation.agent.branchId === actor.branchId);
    if (!inScope) throw notFound("Conversation not found");
    return;
  }

  const allowed =
    actor.type === "AGENT"
      ? conversation.agentId === actor.agentId
      : conversation.visitorId === actor.visitorId;

  if (!allowed) throw forbidden("This conversation belongs to someone else");
}

/** What `assertAccess` needs loaded alongside a conversation. */
const ACCESS_AGENT = {
  select: { branchId: true, branch: { select: { companyId: true } } },
} as const;

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
    select: { agentId: true, visitorId: true, agent: ACCESS_AGENT },
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
    include: {
      agent: { include: { branch: { select: { companyId: true } } } },
      visitor: true,
      messages: { orderBy: [...MESSAGE_ORDER], include: MESSAGE_INCLUDE },
    },
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
    select: { id: true, agentId: true, visitorId: true, status: true, agent: ACCESS_AGENT },
  });
  if (!conversation) throw notFound("Conversation not found");

  // Admins observe; they never speak. Without this an admin token would fall
  // through to the VISITOR branch below and could post as the visitor.
  if (actor.type === "ADMIN") throw forbidden("Admins cannot send messages");

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
    const existing = await prisma.message.findUnique({
      where: { clientId: input.clientId },
      include: MESSAGE_INCLUDE,
    });
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

  // Checked against storage before anything is written, so a message never
  // points at a missing, oversized or mislabelled file.
  const upload = input.attachment
    ? await verifyUpload(
        input.attachment.uploadToken,
        conversationId,
        expectedSender,
        input.attachment.durationMs,
        input.attachment.waveform,
      )
    : null;

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
          ...(upload ? { attachment: { create: upload } } : {}),
        },
        include: MESSAGE_INCLUDE,
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
      const stored = await prisma.message.findUnique({
        where: { clientId: input.clientId },
        include: MESSAGE_INCLUDE,
      });
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
    include: { agent: ACCESS_AGENT },
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
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        include: MESSAGE_INCLUDE,
      },
      _count: { select: { messages: true } },
    },
  });

  return rows.map(toConversationSummary);
}
