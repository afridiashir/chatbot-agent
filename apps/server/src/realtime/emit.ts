import { rooms } from "@repo/types";
import { markReceipt } from "../services/receipts.js";
import type {
  Agent,
  AgentStatusPayload,
  ReceiptPayload,
  Conversation,
  ConversationWithAgent,
  Message,
  Reaction,
} from "@repo/types";
import type { AppServer } from "./types.js";

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
export async function announceMessage(message: Message): Promise<void> {
  emitMessage(message);
  if (!(await recipientConnected(message))) return;
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

export function emitConversationAssigned(conversation: ConversationWithAgent): void {
  io?.to(rooms.agent(conversation.agentId)).emit("conversation:assigned", conversation);
}

export function emitConversationClosed(conversation: Conversation): void {
  io?.to(rooms.conversation(conversation.id))
    .to(rooms.agent(conversation.agentId))
    .emit("conversation:closed", conversation);
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
 * Company admins hear about every branch of their own company; branch admins
 * only about theirs. Nobody hears about another company.
 */
export function emitAgentStatus(payload: AgentStatusPayload, companyId: string): void {
  io?.to(rooms.adminCompany(companyId))
    .to(rooms.adminBranch(payload.branchId))
    .emit("agent:status", payload);
}
