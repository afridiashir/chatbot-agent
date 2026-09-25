import { rooms } from "@repo/types";
import { prisma } from "@repo/db";
import { markReceipt } from "../services/receipts.js";
import { pushToAgent, pushToVisitor } from "../services/push.js";
import type {
  Agent,
  AgentStatusPayload,
  ReceiptPayload,
  Conversation,
  ConversationTransfer,
  ConversationWithAgent,
  LabelRef,
  Message,
  MessageAuthor,
  Reaction,
} from "@repo/types";
import type { AppServer, AppSocket } from "./types.js";

/**
 * The single Socket.IO instance, set once at boot. REST handlers broadcast
 * through these helpers so an HTTP-delivered message reaches the room just like
 * a socket-delivered one.
 *
 * Every helper is a no-op until the server is attached, which keeps the routes
 * usable in isolation (for example from scripts).
 */
let io: AppServer | null = null;

export function setRealtimeServer(server: AppServer): void {
  io = server;
}

export function emitMessage(message: Message): void {
  io?.to(rooms.conversation(message.conversationId)).emit("message:new", message);
}

/** Everyone in the chat, the reader included, so each screen agrees on the ticks. */
export function emitReceipt(receipt: ReceiptPayload): void {
  io?.to(rooms.conversation(receipt.conversationId)).emit("message:receipt", receipt);
}

/**
 * Whether the other side of a message has an app connected to the chat right
 * now, which is what "delivered" means. Admin observers don't count.
 */
export async function recipientConnected(message: Message): Promise<boolean> {
  if (!io) return false;
  const recipient = message.senderType === "AGENT" ? "VISITOR" : "AGENT";
  const sockets = await io.in(rooms.conversation(message.conversationId)).fetchSockets();
  return sockets.some((socket) => socket.data.type === recipient);
}

/**
 * Broadcasts a newly stored message, then, if the other side is connected to
 * the chat, marks it delivered straight away.
 */
/** True when this agent has no dashboard connected anywhere. */
async function agentAway(agentId: string): Promise<boolean> {
  if (!io) return true;
  const sockets = await io.in(rooms.agent(agentId)).fetchSockets();
  return sockets.length === 0;
}

/**
 * A visitor has written to an agent whose dashboard is shut. The inbox itself
 * is only reached through the notification, so nothing of the chat is put in
 * it beyond who is waiting.
 */
async function notifyAbsentAgent(message: Message): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: { agentId: true, visitor: { select: { name: true } } },
    });
    if (!conversation || !(await agentAway(conversation.agentId))) return;
    await pushToAgent(
      conversation.agentId,
      conversation.visitor.name,
      message.content || "Sent a message",
      `chat-${message.conversationId}`,
    );
  } catch (error) {
    console.error("[push] agent notification", error);
  }
}

/**
 * The visitor has left the chat page, so the agent's answer goes out as a Web
 * Push notification instead. Best effort: a failure here must never hold up
 * the message that was already delivered to everyone connected.
 */
async function notifyAbsentVisitor(message: Message): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: { visitorId: true, agent: { select: { name: true } } },
    });
    if (!conversation) return;
    await pushToVisitor(conversation.visitorId, conversation.agent.name, message);
  } catch (error) {
    console.error("[push] visitor notification", error);
  }
}

export async function announceMessage(message: Message): Promise<void> {
  emitMessage(message);

  if (!(await recipientConnected(message))) {
    // Nobody is holding the chat open on the other side, so it goes out as a
    // notification instead.
    if (message.senderType === "AGENT") void notifyAbsentVisitor(message);
    else void notifyAbsentAgent(message);
    return;
  }
  const reader = message.senderType === "AGENT" ? "VISITOR" : "AGENT";
  const receipt = await markReceipt(message.conversationId, reader, "DELIVERED");
  if (receipt) emitReceipt(receipt);
}

/** Everyone in the chat sees a reaction the moment it changes. */
export function emitReaction(
  conversationId: string,
  messageId: string,
  reactions: Reaction[],
): void {
  io?.to(rooms.conversation(conversationId)).emit("message:reaction", {
    conversationId,
    messageId,
    reactions,
  });
}

/**
 * A chat has landed in this agent's inbox.
 *
 * `handedOver` is the difference between a chat that has just started and one
 * that has been going for a while under somebody else. The dashboard needs it
 * because the payload cannot carry a transcript: an inbox row drawn from this
 * alone would say "no messages yet" about a chat with twenty, so a handed-over
 * one is fetched properly instead. The notification wording follows for the
 * same reason — being told someone "started a conversation" sends the agent
 * looking for an opening message that is already several replies old.
 */
export function emitConversationAssigned(
  conversation: ConversationWithAgent,
  options: { handedOver?: boolean; notification?: { title: string; body: string } } = {},
): void {
  const handedOver = options.handedOver ?? false;
  const notification = options.notification ?? {
    title: "New chat",
    body: `${conversation.visitor.name} started a conversation`,
  };

  io?.to(rooms.agent(conversation.agentId)).emit("conversation:assigned", conversation, {
    handedOver,
  });

  // A chat nobody is watching is the one most worth a notification.
  void (async () => {
    try {
      if (!(await agentAway(conversation.agentId))) return;
      await pushToAgent(
        conversation.agentId,
        notification.title,
        notification.body,
        `chat-${conversation.id}`,
      );
    } catch (error) {
      console.error("[push] new chat notification", error);
    }
  })();
}

/**
 * A chat changed hands.
 *
 * Unlike a label change this does go to the conversation room: the visitor is
 * in there and is meant to see it, because the name and photo in their header
 * have to become whoever is answering now. What they are not told is that an
 * admin moved them — only who they are talking to.
 *
 * The agent who lost the chat hears it in their own room, and both branches'
 * admins hear it, since a transfer across branches moves the row out of one
 * list and into the other.
 */
export function emitConversationTransferred(
  transfer: ConversationTransfer,
  previous: { agentId: string; branchId: string },
  companyId: string,
): void {
  if (!io) return;
  const server = io;
  const room = rooms.conversation(transfer.conversationId);

  server
    .to(room)
    .to(rooms.agent(previous.agentId))
    .to(rooms.adminCompany(companyId))
    .to(rooms.adminBranch(previous.branchId))
    .to(rooms.adminBranch(transfer.agent.branchId))
    .emit("conversation:transferred", transfer);

  // Membership of the room is what grants the previous agent everything said in
  // the chat from here on, so it is taken back on the server rather than left
  // to their dashboard to give up voluntarily.
  void server.in(rooms.agent(previous.agentId)).socketsLeave(room);

  // Same for the branch admins the chat has just left behind: a company admin
  // may move a chat between branches, and a branch admin watches their own
  // branch only. Their row disappears on the event above; this is what stops
  // the messages.
  if (previous.branchId === transfer.agent.branchId) return;
  void (async () => {
    for (const socket of await server.in(room).fetchSockets()) {
      const watcher = socket.data;
      if (
        watcher.type === "ADMIN" &&
        watcher.branchId !== null &&
        watcher.branchId !== transfer.agent.branchId
      ) {
        void socket.leave(room);
      }
    }
  })();
}

export function emitConversationClosed(conversation: Conversation): void {
  io?.to(rooms.conversation(conversation.id))
    .to(rooms.agent(conversation.agentId))
    .emit("conversation:closed", conversation);
}

/**
 * One message is gone for good.
 *
 * To the conversation room, which holds the visitor and whoever is answering:
 * the whole point of removing something said in error is that it stops being on
 * anybody's screen. The agent's own room as well, because a chat they have
 * closed is one they are no longer in, and its inbox row may be quoting the
 * message that has just gone.
 */
export function emitMessageDeleted(message: {
  conversationId: string;
  messageId: string;
  agentId: string;
}): void {
  io?.to(rooms.conversation(message.conversationId))
    .to(rooms.agent(message.agentId))
    .emit("message:deleted", {
      conversationId: message.conversationId,
      messageId: message.messageId,
    });
}

/**
 * The chat is gone for good. Sent to the room before everyone is dropped from
 * it, and to the agent's dashboard so the row leaves their inbox.
 */
export function emitConversationDeleted(conversation: { id: string; agentId: string }): void {
  io?.to(rooms.conversation(conversation.id))
    .to(rooms.agent(conversation.agentId))
    .emit("conversation:deleted", { conversationId: conversation.id });
}

/**
 * Labels changed on a chat.
 *
 * Sent to the assigned agent's room and to the admin rooms, never to the
 * conversation room: the visitor sits in that one, and what the team labelled
 * them is none of their business.
 */
export function emitConversationLabels(
  target: { conversationId: string; agentId: string; branchId: string; companyId: string },
  labels: LabelRef[],
): void {
  io?.to(rooms.agent(target.agentId))
    .to(rooms.adminCompany(target.companyId))
    .to(rooms.adminBranch(target.branchId))
    .emit("conversation:labels", { conversationId: target.conversationId, labels });
}

/**
 * Tells the staff side that an admin, not the agent, typed a message.
 *
 * Sent after the message itself, and deliberately not to the conversation room:
 * the visitor is in there, and the whole point of replying on the agent's
 * behalf is that the visitor keeps seeing one person.
 */
export function emitMessageAuthor(
  target: { conversationId: string; agentId: string; branchId: string; companyId: string },
  messageId: string,
  author: MessageAuthor,
): void {
  io?.to(rooms.agent(target.agentId))
    .to(rooms.adminCompany(target.companyId))
    .to(rooms.adminBranch(target.branchId))
    .emit("message:authored", { conversationId: target.conversationId, messageId, author });
}

/**
 * A new photo reaches visitors mid-chat and the agent's own dashboard, rather
 * than waiting for someone to reload.
 */
export function emitAgentProfile(agent: Agent, conversationIds: string[]): void {
  if (!io) return;
  let target = io.to(rooms.agent(agent.id));
  for (const id of conversationIds) target = target.to(rooms.conversation(id));
  target.emit("agent:profile", {
    agentId: agent.id,
    name: agent.name,
    avatarUrl: agent.avatarUrl,
  });
}

/**
 * The team's label for a client changed.
 *
 * Staff rooms only, for the same reason labels are: this is the office's
 * shorthand, and the conversation room holds the person it describes.
 */
export function emitVisitorRenamed(
  target: { conversationId: string; agentId: string; branchId: string; companyId: string },
  displayName: string | null,
): void {
  io?.to(rooms.agent(target.agentId))
    .to(rooms.adminCompany(target.companyId))
    .to(rooms.adminBranch(target.branchId))
    .emit("visitor:renamed", { conversationId: target.conversationId, displayName });
}

/**
 * Whether the visitor is sitting in the chat right now.
 *
 * Staff rooms only, like labels: it tells an agent whether the person is there
 * to answer, and the visitor has no business being told they are being watched.
 * `only` sends it to a single dashboard instead — how one that has just joined
 * the room learns where things stand.
 */
export function emitVisitorStatus(
  target: { conversationId: string; agentId: string; branchId: string; companyId: string },
  isOnline: boolean,
  only?: AppSocket,
): void {
  const payload = { conversationId: target.conversationId, isOnline };
  if (only) {
    only.emit("visitor:status", payload);
    return;
  }
  io?.to(rooms.agent(target.agentId))
    .to(rooms.adminCompany(target.companyId))
    .to(rooms.adminBranch(target.branchId))
    .emit("visitor:status", payload);
}

/**
 * How many visitor sockets are sitting in a conversation, ignoring one that is
 * on its way out — `disconnecting` still counts the socket that fired it.
 */
export async function visitorsIn(
  conversationId: string,
  excludeSocketId?: string,
): Promise<number> {
  if (!io) return 0;
  const sockets = await io.in(rooms.conversation(conversationId)).fetchSockets();
  return sockets.filter((socket) => socket.data.type === "VISITOR" && socket.id !== excludeSocketId)
    .length;
}

/**
 * Company admins hear about every branch of their own company; branch admins
 * only about theirs. Nobody hears about another company.
 */
export function emitAgentStatus(payload: AgentStatusPayload, companyId: string): void {
  io?.to(rooms.adminCompany(companyId))
    .to(rooms.adminBranch(payload.branchId))
    .emit("agent:status", payload);
}
