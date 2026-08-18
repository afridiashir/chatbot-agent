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
