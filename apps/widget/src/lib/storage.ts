/**
 * The widget runs on someone else's page, where localStorage can be blocked
 * outright (private mode, blocked third-party storage). Every access is guarded
 * and falls back to memory so a blocked store degrades to "chat works until you
 * refresh" rather than a crash.
 */
const VISITOR_KEY = "acme-chat:visitorId";
const CONVERSATION_KEY = "acme-chat:conversationId";

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
