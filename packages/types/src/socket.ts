import type {
  Conversation,
  ConversationTransfer,
  ConversationWithAgent,
  Message,
  MessageAuthor,
  Reaction,
  SenderType,
} from "./domain";
import type { LabelRef } from "./labels";

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
  /** The full set of reactions on a message, after someone changed theirs. */
  "message:reaction": (payload: {
    conversationId: string;
    messageId: string;
    reactions: Reaction[];
  }) => void;
  /**
   * A chat is now this agent's. `context` says how it got there: a chat handed
   * over carries everything already said in it, so an inbox must fetch the real
   * row rather than draw an empty one, and must not greet it as a chat someone
   * has just started.
   */
  "conversation:assigned": (
    conversation: ConversationWithAgent,
    context?: { handedOver: boolean },
  ) => void;
  "conversation:closed": (conversation: Conversation) => void;
  /**
   * A closed chat was opened again — ended by mistake, or the visitor came
   * back to the same thing. The transcript is unchanged; only its status is.
   */
  "conversation:reopened": (conversation: Conversation) => void;
  /**
   * An admin deleted the chat. Nothing of it survives on the server, so every
   * screen still showing it has to let it go rather than refetch.
   */
  "conversation:deleted": (payload: { conversationId: string }) => void;
  /**
   * An admin removed one message. Everyone holding the chat drops it: there is
   * no copy left on the server, and the point of removing something said in
   * error is that no trace of it stays on screen either.
   */
  "message:deleted": (payload: { conversationId: string; messageId: string }) => void;
  /**
   * The labels on a chat changed. Staff rooms only — the conversation room
   * holds the visitor too, and labels are the team's notes, not theirs.
   */
  "conversation:labels": (payload: { conversationId: string; labels: LabelRef[] }) => void;
  /**
   * An admin handed the chat to another agent. The previous agent drops it,
   * the visitor's header switches to the new agent, and admin lists move the
   * row. The new agent hears about it through `conversation:assigned`, the
   * same as any chat that has just reached them.
   *
   * Everything here is already public to the visitor — it is the agent card
   * the widget shows — so it can go to the conversation room.
   */
  "conversation:transferred": (payload: ConversationTransfer) => void;
  /**
   * An admin sent the message with this id in the agent's place. Staff rooms
   * only — the message itself already reached the conversation room looking
   * like the agent, which is what the visitor should keep seeing.
   */
  "message:authored": (payload: {
    conversationId: string;
    messageId: string;
    author: MessageAuthor;
  }) => void;
  /**
   * The team has relabelled this person — "Umar -M1- 8344- LHR".
   *
   * Staff rooms only, like labels: it is the office's shorthand for a client
   * and the client has no business reading it. Sent once per chat they have,
   * because the label belongs to the person and every row showing them changes
   * at the same moment.
   */
  "visitor:renamed": (payload: {
    conversationId: string;
    displayName: string | null;
    /** The name they gave, after an agent corrected it. */
    name: string;
  }) => void;
  /**
   * Whether the visitor has the chat open right now, for the staff side only.
   *
   * Derived from the sockets in the conversation's room rather than stored: a
   * browser that is closed without warning stops being counted, which a column
   * on the visitor could never manage. Sent when it changes, and once to a
   * dashboard as it joins the room, so a freshly opened inbox is not blank.
   */
  "visitor:status": (payload: {
    conversationId: string;
    isOnline: boolean;
    /** When they were last in the chat, for the "last seen" line. */
    lastSeenAt?: string | null;
  }) => void;
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
  /**
   * Adds, replaces or removes this side's reaction to a message. `emoji: null`
   * takes it back, and sending the same emoji again is also a take-back.
   */
  "message:react": (
    payload: { conversationId: string; messageId: string; emoji: string | null },
    ack?: (result: SocketAck<Reaction[]>) => void,
  ) => void;
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
