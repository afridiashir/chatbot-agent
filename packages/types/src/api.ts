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
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * Result of `assignAgent(branchId)`. When no agent is online we deliberately
 * return `available: false` rather than creating a conversation nobody owns.
 */
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
