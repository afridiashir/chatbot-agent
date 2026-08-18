"use client";

/**
 * Messages the agent has sent but the server has not yet confirmed, and drafts
 * they are still writing. Both live in localStorage so a reload, a crash or a
 * connection drop does not lose typing that was already done.
 *
 * The queue is keyed by `clientId`, the same idempotency key the server stores,
 * so flushing after a reconnect can never duplicate a message that actually
 * made it through before the connection died.
 */
const OUTBOX_KEY = "acme-dashboard:outbox";
const DRAFTS_KEY = "acme-dashboard:drafts";

export interface QueuedMessage {
  clientId: string;
  conversationId: string;
  content: string;
  /** When the agent hit send, so the pending bubble sits in the right place. */
  createdAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked; the in-memory copy still works this session.
  }
}

export const loadOutbox = (): QueuedMessage[] => read<QueuedMessage[]>(OUTBOX_KEY, []);
export const saveOutbox = (queue: QueuedMessage[]): void => write(OUTBOX_KEY, queue);

export const loadDrafts = (): Record<string, string> => read<Record<string, string>>(DRAFTS_KEY, {});

export function saveDraft(conversationId: string, content: string): void {
  const drafts = loadDrafts();
  if (content.trim()) drafts[conversationId] = content;
  else delete drafts[conversationId];
  write(DRAFTS_KEY, drafts);
}

export function newClientId(): string {
  return crypto.randomUUID();
}
