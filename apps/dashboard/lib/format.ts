const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** How many whole days ago, in local time. 0 = today, 1 = yesterday. */
function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
}

/** "14:32" — the timestamp shown inside a message bubble. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The right-hand timestamp in the conversation list: a clock time today, then
 * progressively coarser, so the column stays narrow.
 */
export function formatListTime(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return formatClock(iso);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** The pill that separates one day's messages from the next. */
export function formatDateSeparator(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** True when two timestamps fall on different local days. */
export function isNewDay(iso: string, previousIso: string | undefined): boolean {
  if (!previousIso) return true;
  return startOfDay(new Date(iso)) !== startOfDay(new Date(previousIso));
}

/**
 * How long ago, in the words a chat app uses: "just now", "5 minutes ago",
 * "yesterday". Only ever approximate — the point of a last-seen line is
 * whether it is worth waiting for a reply, not the exact second.
 */
export function sinceWhen(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
