import { rooms } from "@repo/types";
import type { AgentStatusPayload, Conversation, ConversationWithAgent, Message } from "@repo/types";
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

export function emitConversationAssigned(conversation: ConversationWithAgent): void {
  io?.to(rooms.agent(conversation.agentId)).emit("conversation:assigned", conversation);
}

export function emitConversationClosed(conversation: Conversation): void {
  io?.to(rooms.conversation(conversation.id))
    .to(rooms.agent(conversation.agentId))
    .emit("conversation:closed", conversation);
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
