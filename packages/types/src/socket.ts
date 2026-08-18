import type { Conversation, ConversationWithAgent, Message, SenderType } from "./domain";

/** Room helpers — the single source of truth for room naming. */
export const rooms = {
  conversation: (conversationId: string) => `conversation:${conversationId}` as const,
  agent: (agentId: string) => `agent:${agentId}` as const,
  /** Admin sockets only — carries company-wide status changes. */
  admin: () => "admin" as const,
};

export interface AgentStatusPayload {
  agentId: string;
  branchId: string;
  isOnline: boolean;
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
  "typing:update": (payload: TypingPayload) => void;
  "error": (payload: { message: string }) => void;
}

/** Events clients emit to the server. The ack callback keeps failures visible. */
export interface ClientToServerEvents {
  "conversation:join": (
    payload: { conversationId: string },
    ack?: (result: SocketAck) => void,
  ) => void;
  "conversation:leave": (payload: { conversationId: string }) => void;
  "message:send": (
    payload: { conversationId: string; content: string; clientId?: string },
    ack?: (result: SocketAck<Message>) => void,
  ) => void;
  /**
   * Best-effort and deliberately unacknowledged: a lost typing notice is
   * invisible to the user, so it is not worth a round trip.
   */
  "typing": (payload: { conversationId: string; isTyping: boolean }) => void;
}

export type SocketAck<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; message: string };

/**
 * Handshake auth. Visitors identify with the id they keep in localStorage;
 * agents present the JWT issued at login. Admin sockets are read-only viewers.
 */
export type SocketAuth =
  | { role: "VISITOR"; visitorId: string }
  | { role: "AGENT"; token: string }
  | { role: "ADMIN"; token: string };
