import type { Conversation, ConversationWithAgent, Message, SenderType } from "./domain";

/** Room helpers — the single source of truth for room naming. */
export const rooms = {
  conversation: (conversationId: string) => `conversation:${conversationId}` as const,
  agent: (agentId: string) => `agent:${agentId}` as const,
  /** Company admins — status changes across every branch of their company. */
  adminCompany: (companyId: string) => `admin:company:${companyId}` as const,
  /** Branch admins — status changes in their one branch. */
  adminBranch: (branchId: string) => `admin:branch:${branchId}` as const,
};

export interface AgentStatusPayload {
  agentId: string;
  branchId: string;
  isOnline: boolean;
}

/** An agent's name or photo changed; open chats redraw their header. */
export interface AgentProfilePayload {
  agentId: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Every message from `senderType` up to `at` is now delivered, or read. Sent
 * as one sweep rather than per message: seeing a chat reads all of it.
 */
export interface ReceiptPayload {
  conversationId: string;
  senderType: SenderType;
  status: "DELIVERED" | "READ";
  at: string;
}

/** Applies a receipt to a list of messages, keeping the earliest times. */
export function applyReceipt<T extends Message>(messages: T[], receipt: ReceiptPayload): T[] {
  let changed = false;
  const next = messages.map((message) => {
    if (
      message.conversationId !== receipt.conversationId ||
      message.senderType !== receipt.senderType ||
      message.createdAt > receipt.at
    ) {
      return message;
    }
    const deliveredAt = message.deliveredAt ?? receipt.at;
    const readAt = receipt.status === "READ" ? (message.readAt ?? receipt.at) : message.readAt;
    if (deliveredAt === message.deliveredAt && readAt === message.readAt) return message;
    changed = true;
    return { ...message, deliveredAt, readAt };
  });
  return changed ? next : messages;
}

/** Who is typing, and whether they still are. Never persisted. */
export interface TypingPayload {
  conversationId: string;
  senderType: SenderType;
  isTyping: boolean;
}

/**
 * Timings for the typing indicator, shared so both ends agree.
 *
 * The sender re-announces every HEARTBEAT_MS while it keeps typing, and the
 * receiver clears the indicator if nothing arrives within EXPIRY_MS. That
 * pairing is what makes a dropped connection or a closed tab clear the
 * indicator on its own, instead of leaving "typing..." on screen forever.
 */
export const TYPING = {
  /** Sender: stop announcing this long after the last keystroke. */
  IDLE_MS: 2000,
  /** Sender: re-announce at most this often while typing continuously. */
  HEARTBEAT_MS: 1500,
  /** Receiver: hide the indicator if no announcement arrives within this. */
  EXPIRY_MS: 4000,
} as const;

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  "message:new": (message: Message) => void;
  "conversation:assigned": (conversation: ConversationWithAgent) => void;
  "conversation:closed": (conversation: Conversation) => void;
  "agent:status": (payload: AgentStatusPayload) => void;
  "agent:profile": (payload: AgentProfilePayload) => void;
  "message:receipt": (payload: ReceiptPayload) => void;
  "typing:update": (payload: TypingPayload) => void;
  error: (payload: { message: string }) => void;
}

/** Events clients emit to the server. The ack callback keeps failures visible. */
export interface ClientToServerEvents {
  "conversation:join": (
    payload: { conversationId: string },
    ack?: (result: SocketAck) => void,
  ) => void;
  "conversation:leave": (payload: { conversationId: string }) => void;
  /** The chat is on screen: everything the other side said so far is read. */
  "conversation:read": (payload: { conversationId: string }) => void;
  "message:send": (
    payload: {
      conversationId: string;
      content: string;
      clientId?: string;
      /** Quotes an earlier message of this conversation. */
      replyToId?: string;
      /** From an upload ticket; `durationMs` for voice notes and audio. */
      attachment?: { uploadToken: string; durationMs?: number; waveform?: number[] };
    },
    ack?: (result: SocketAck<Message>) => void,
  ) => void;
  /**
   * Best-effort and deliberately unacknowledged: a lost typing notice is
   * invisible to the user, so it is not worth a round trip.
   */
  typing: (payload: { conversationId: string; isTyping: boolean }) => void;
}

export type SocketAck<T = undefined> =
  (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; message: string };

/**
 * Handshake auth. Visitors identify with the id they keep in localStorage;
 * agents present the JWT issued at login. Admin sockets are read-only viewers.
 */
export type SocketAuth =
  | { role: "VISITOR"; visitorId: string }
  | { role: "AGENT"; token: string }
  | { role: "ADMIN"; token: string };
