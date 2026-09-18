/**
 * The widget runs on someone else's page, where localStorage can be blocked
 * outright (private mode, blocked third-party storage). Every access is guarded
 * and falls back to memory so a blocked store degrades to "chat works until you
 * refresh" rather than a crash.
 */
const VISITOR_KEY = "acme-chat:visitorId";
const CONVERSATION_KEY = "acme-chat:conversationId";
/** Their details and the branch they last chose, so we never ask twice. */
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
  email: string;
  phone: string;
  /** The branch of their last chat, offered again for the next one. */
  branchId?: string;
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
    if (!parsed.name || !parsed.email || !parsed.phone) return null;
    return {
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      ...(parsed.branchId ? { branchId: parsed.branchId } : {}),
    };
  } catch {
    return null;
  }
}

export const storeSavedVisitor = (visitor: SavedVisitor): void =>
  write(VISITOR_DETAILS_KEY, JSON.stringify(visitor));
