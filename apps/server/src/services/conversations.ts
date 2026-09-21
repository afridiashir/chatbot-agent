import { Prisma, prisma } from "@repo/db";
import type {
  AssignmentResult,
  Conversation,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  Message,
  MessageAuthor,
  Reaction,
} from "@repo/types";
import type { CreateConversationBody, CreateMessageBody } from "@repo/validation";
import type { Actor } from "../lib/actor.js";
import { conflict, forbidden, notFound } from "../lib/http.js";
import { verifyUpload } from "./media.js";
import {
  LABEL_INCLUDE,
  MESSAGE_INCLUDE,
  toConversation,
  toConversationDetail,
  toConversationSummary,
  toMessage,
} from "../lib/serialize.js";
import { assignAgent } from "./routing.js";
import { mainBranch } from "./branches.js";

/** Oldest first, with `id` as a stable tie-break for identical timestamps. */
const MESSAGE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

export async function createConversation(input: CreateConversationBody): Promise<AssignmentResult> {
  const { agentId, branchId, ...rest } = input;

  if (!agentId) {
    // No agent link. A branch link names its branch; anything else — the plain
    // widget on a website — goes to the company's main branch, because the
    // pre-chat form no longer asks the visitor to choose.
    const target = branchId ?? (await mainBranch())?.id;
    if (!target) throw notFound("No branch is available to take this chat");
    return assignAgent({ ...rest, branchId: target });
  }

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

  // Staff see who really typed each message; a visitor is served the same
  // endpoint and must not, so the key is absent rather than empty for them.
  return {
    ...toConversationDetail(conversation),
    ...(actor.type === "VISITOR"
      ? {}
      : { adminAuthored: await adminAuthors(conversation.messages) }),
  };
}

/**
 * The staff rooms that care about a change to this conversation: the assigned
 * agent, and the admins of its company and branch.
 *
 * Deliberately excludes the conversation room, which holds the visitor. Both
 * things broadcast through it — label changes and admin authorship — are the
 * team's business and not the visitor's.
 */
export async function staffBroadcastTarget(conversationId: string): Promise<{
  conversationId: string;
  agentId: string;
  branchId: string;
  companyId: string;
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      agentId: true,
      agent: { select: { branchId: true, branch: { select: { companyId: true } } } },
    },
  });
  if (!conversation) throw notFound("Conversation not found");
  return {
    conversationId: conversation.id,
    agentId: conversation.agentId,
    branchId: conversation.agent.branchId,
    companyId: conversation.agent.branch.companyId,
  };
}

/** The admin behind an intervention, for the staff-side marker. */
export async function currentAdminAuthor(adminId: string): Promise<MessageAuthor | null> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, name: true },
  });
  return admin ? { adminId: admin.id, adminName: admin.name } : null;
}

/**
 * Which of these messages an admin sent in the agent's place, keyed by message
 * id. One query for the whole transcript rather than a join on every message,
 * since in practice almost none of them are admin-sent.
 */
export async function adminAuthors(
  messages: Array<{ id: string; sentByAdminId: string | null }>,
): Promise<Record<string, MessageAuthor>> {
  const ids = [...new Set(messages.flatMap((m) => (m.sentByAdminId ? [m.sentByAdminId] : [])))];
  if (ids.length === 0) return {};

  const admins = await prisma.admin.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const byId = new Map(admins.map((admin) => [admin.id, admin.name]));

  const out: Record<string, MessageAuthor> = {};
  for (const message of messages) {
    const name = message.sentByAdminId ? byId.get(message.sentByAdminId) : undefined;
    if (message.sentByAdminId && name) {
      out[message.id] = { adminId: message.sentByAdminId, adminName: name };
    }
  }
  return out;
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
/**
 * How many of the visitor's messages the agent has not read, per conversation.
 * One grouped query for the whole page: the read receipt already records this,
 * so nothing new has to be tracked.
 */
export async function unreadCounts(conversationIds: string[]): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();

  const groups = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: conversationIds },
      senderType: "VISITOR",
      readAt: null,
    },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.conversationId, group._count._all]));
}

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

  // `assertAccess` already confines an admin to their company and branch.
  assertAccess(conversation, actor);

  /*
   * An admin may step in and answer in the agent's place. The message is stored
   * as AGENT, because the visitor has been talking to that agent and should go
   * on seeing them — `sentByAdminId` is the record of who actually typed it.
   *
   * What an admin still may not do is speak as the visitor, which is why the
   * expected sender is pinned rather than taken from the request.
   */
  const expectedSender = actor.type === "VISITOR" ? "VISITOR" : "AGENT";
  if (input.senderType !== expectedSender) {
    throw forbidden(`You can only send messages as ${expectedSender}`);
  }
  const sentByAdminId = actor.type === "ADMIN" ? actor.adminId : null;

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

  // A reply may only quote a message from the same conversation, so a quote
  // can never leak text from someone else's chat.
  if (input.replyToId) {
    const quoted = await prisma.message.findUnique({
      where: { id: input.replyToId },
      select: { conversationId: true },
    });
    if (!quoted || quoted.conversationId !== conversationId) {
      throw notFound("The message you replied to no longer exists");
    }
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
          replyToId: input.replyToId ?? null,
          clientId: input.clientId ?? null,
          sentByAdminId,
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
 * Adds, replaces or removes one side's reaction to a message, and returns
 * whatever the message is left carrying.
 *
 * One row per side per message, so reacting again replaces the previous
 * reaction; sending the emoji already there takes it back, which is what makes
 * tapping the same one twice undo it. Admins observe and never react.
 */
export async function reactToMessage(
  messageId: string,
  emoji: string | null,
  actor: Actor,
): Promise<{ conversationId: string; reactions: Reaction[] }> {
  if (actor.type === "ADMIN") throw forbidden("Admins cannot react to messages");

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversation: {
        select: { id: true, agentId: true, visitorId: true, status: true, agent: ACCESS_AGENT },
      },
    },
  });
  if (!message) throw notFound("Message not found");

  const conversation = message.conversation;
  assertAccess(conversation, actor);
  if (conversation.status === "CLOSED") throw conflict("This conversation has been closed");

  const senderType = actor.type === "AGENT" ? "AGENT" : "VISITOR";
  const existing = await prisma.reaction.findUnique({
    where: { messageId_senderType: { messageId, senderType } },
    select: { emoji: true },
  });

  // Same emoji again, or an explicit null: take it back.
  if (!emoji || existing?.emoji === emoji) {
    if (existing) {
      await prisma.reaction.delete({
        where: { messageId_senderType: { messageId, senderType } },
      });
    }
  } else {
    await prisma.reaction.upsert({
      where: { messageId_senderType: { messageId, senderType } },
      create: { messageId, senderType, emoji },
      update: { emoji, createdAt: new Date() },
    });
  }

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" },
    select: { emoji: true, senderType: true },
  });

  return { conversationId: conversation.id, reactions };
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
      ...LABEL_INCLUDE,
      _count: { select: { messages: true } },
    },
  });

  const unread = await unreadCounts(rows.map((row) => row.id));
  return rows.map((row) => toConversationSummary(row, unread.get(row.id) ?? 0));
}
