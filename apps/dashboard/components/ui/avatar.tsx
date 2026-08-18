import { cn } from "@/lib/utils";

/**
 * Avatars are generated, not stored: nobody uploads a picture, so the colour is
 * derived from a stable seed (the row id) and the initials from the name. The
 * same person therefore always looks the same, across every screen and every
 * reload, without a single extra byte in the database or a request off-origin.
 *
 * Every colour here is dark enough for white text to clear WCAG AA.
 */
const PALETTE = [
  "#0f766e",
  "#166534",
  "#1d4ed8",
  "#4338ca",
  "#6d28d9",
  "#9d174d",
  "#b45309",
  "#0369a1",
  "#7c2d12",
  "#155e75",
  "#3f6212",
  "#86198f",
] as const;

/** FNV-1a: tiny, stable, and good enough to spread names across the palette. */
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return Math.abs(value);
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "?").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

interface AvatarProps {
  name: string;
  /** Stable identity for the colour. Falls back to the name. */
  seed?: string;
  size?: keyof typeof SIZES;
  /** Renders a presence dot when set; omit entirely for people with no status. */
  online?: boolean;
  className?: string;
}

export function Avatar({ name, seed, size = "md", online, className }: AvatarProps) {
  const color = PALETTE[hash(seed ?? name) % PALETTE.length];

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        aria-hidden="true"
        style={{ backgroundColor: color }}
        className={cn(
          "flex items-center justify-center rounded-full font-semibold tracking-wide text-white select-none",
          SIZES[size],
        )}
      >
        {initials(name)}
      </span>

      {online !== undefined && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-0 bottom-0 rounded-full ring-2 ring-[var(--chat-panel)]",
            size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5",
            online ? "bg-emerald-500" : "bg-neutral-400",
          )}
        />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
