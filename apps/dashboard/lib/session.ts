/**
 * Agent and admin sessions are stored under separate keys so signing in as one
 * never clobbers the other — the two are different accounts entirely.
 */
const KEYS = {
  AGENT: "acme-dashboard:agent-token",
  ADMIN: "acme-dashboard:admin-token",
} as const;

export type SessionKind = keyof typeof KEYS;

/** Guarded so a blocked localStorage signs the user out rather than crashing. */
export function getToken(kind: SessionKind): string | null {
  try {
    return window.localStorage.getItem(KEYS[kind]);
  } catch {
    return null;
  }
}

export function setToken(kind: SessionKind, token: string): void {
  try {
    window.localStorage.setItem(KEYS[kind], token);
  } catch {
    // Session lasts until reload.
  }
}

export function clearToken(kind: SessionKind): void {
  try {
    window.localStorage.removeItem(KEYS[kind]);
  } catch {
    // Nothing else to do.
  }
}
