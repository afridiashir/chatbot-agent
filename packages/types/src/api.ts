import type { Admin, Agent, Conversation, ConversationWithAgent } from "./domain";

/**
 * Every endpoint answers with this envelope so clients can branch on `ok`
 * without special-casing each route.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level detail, present for validation failures. */
    details?: Record<string, string[]>;
  };
}

export const ApiErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  /** Too many attempts from one place, too quickly. */
  TOO_MANY: "TOO_MANY",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * Result of `assignAgent(branchId)`. When no agent is online we deliberately
 * return `available: false` rather than creating a conversation nobody owns.
 */
/**
 * What a visitor may know about an agent whose personal chat link they opened:
 * enough to greet them by name and photo, never their email.
 */
export interface PublicAgentProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  isOnline: boolean;
  branch: { id: string; name: string };
}

export type AssignmentResult =
  | { available: true; conversation: ConversationWithAgent; resumed: boolean }
  | { available: false; message: string };

export interface LoginResult {
  token: string;
  agent: Agent;
}

export interface AdminLoginResult {
  token: string;
  admin: Admin;
}

/** Returned when deactivating an agent, so the UI can report the side effect. */
export interface DeactivateAgentResult {
  agent: Agent;
  closedConversations: number;
}

export interface CloseConversationResult {
  conversation: Conversation;
}

/**
 * Returned when an admin deletes a conversation. The counts are what actually
 * went with it, so the confirmation can say so rather than guess.
 */
export interface DeleteConversationResult {
  id: string;
  deletedMessages: number;
  deletedAttachments: number;
}

/** One message removed from a chat that otherwise stays where it is. */
export interface DeleteMessageResult {
  id: string;
  conversationId: string;
  /** Whether a photo, video or voice note went with it. */
  deletedAttachment: boolean;
}
