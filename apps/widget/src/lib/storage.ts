import type { MaritalStatus } from "@repo/types";
import { MARITAL_STATUSES } from "@repo/types";

/**
 * The widget runs on someone else's page, where localStorage can be blocked
 * outright (private mode, blocked third-party storage). Every access is guarded
 * and falls back to memory so a blocked store degrades to "chat works until you
 * refresh" rather than a crash.
 */
const VISITOR_KEY = "acme-chat:visitorId";
const CONVERSATION_KEY = "acme-chat:conversationId";
/** What they told us about themselves, so we never ask twice. */
const VISITOR_DETAILS_KEY = "acme-chat:visitor";

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Memory fallback already holds it.
  }
}

function remove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else to do.
  }
}

/** Stable per-browser id. Matches the server's `[A-Za-z0-9_-]{8,64}` rule. */
export function getVisitorId(): string {
  const existing = read(VISITOR_KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  write(VISITOR_KEY, generated);
  return generated;
}

/**
 * The number this browser has identified itself with.
 *
 * It is the visitor's identity now — the widget opens on the chats belonging to
 * it — so it is remembered like a session, and forgetting it is how someone
 * hands the device back or looks up a different number.
 */
const PHONE_KEY = "acme-chat:phone";

export const getStoredPhone = (): string | null => read(PHONE_KEY);
export const storePhone = (phone: string): void => write(PHONE_KEY, phone);
export const clearStoredPhone = (): void => remove(PHONE_KEY);

export const getStoredConversationId = (): string | null => read(CONVERSATION_KEY);
export const storeConversationId = (id: string): void => write(CONVERSATION_KEY, id);
export const clearStoredConversationId = (): void => remove(CONVERSATION_KEY);

const RECENT_EMOJI_KEY = "acme-chat:recent-emoji";

/** The emoji picker's "Recent" row, newest first. */
export function getRecentEmoji(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_EMOJI_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export const storeRecentEmoji = (emoji: string[]): void =>
  write(RECENT_EMOJI_KEY, JSON.stringify(emoji));

export interface SavedVisitor {
  name: string;
  phone: string;
  maritalStatus: MaritalStatus;
  city: string;
}

/**
 * What the visitor told us last time. Kept so that a chat an agent has closed
 * can be picked up again with one tap instead of the form all over again.
 */
export function getSavedVisitor(): SavedVisitor | null {
  const raw = read(VISITOR_DETAILS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedVisitor>;
    // A record written before the form asked for city and marital status is
    // incomplete, not merely old: treat it as absent so the visitor is asked
    // once rather than sent to a server that will reject the submission.
    if (!parsed.name || !parsed.phone || !parsed.city) return null;
    if (!parsed.maritalStatus || !MARITAL_STATUSES.includes(parsed.maritalStatus)) return null;
    return {
      name: parsed.name,
      phone: parsed.phone,
      maritalStatus: parsed.maritalStatus,
      city: parsed.city,
    };
  } catch {
    return null;
  }
}

export const storeSavedVisitor = (visitor: SavedVisitor): void =>
  write(VISITOR_DETAILS_KEY, JSON.stringify(visitor));
