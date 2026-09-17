"use client";

const RECENT_EMOJI_KEY = "mbca.recentEmoji";

/** The agent's most recently used emoji, newest first, for the Recent row. */
export function getRecentEmoji(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_EMOJI_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export function storeRecentEmoji(emoji: string[]): void {
  try {
    window.localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(emoji));
  } catch {
    // Storage blocked: the picker simply forgets what was used.
  }
}
