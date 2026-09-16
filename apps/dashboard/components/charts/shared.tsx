"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Tracks an element's rendered width so SVG charts can draw at 1:1. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * A rounded axis maximum and evenly spaced ticks: 0 / 5 / 10 / 15 rather than
 * 0 / 3.67 / 7.33. Never below 4 so an empty chart still has a scale.
 */
export function niceScale(max: number, count = 4): { max: number; ticks: number[] } {
  const raw = Math.max(max, count) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const top = step * count;
  return { max: top, ticks: Array.from({ length: count + 1 }, (_, i) => i * step) };
}

export const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? "compact" : "standard" }).format(
    value,
  );

/** Picks every nth label so x-axis text never collides. */
export function labelStride(count: number, plotWidth: number, minGap = 52) {
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / minGap))));
}

/** A rect with 4px rounded top corners and a square baseline. */
export function columnPath(x: number, y: number, width: number, height: number, round = true) {
  if (height <= 0) return "";
  const r = round ? Math.min(4, width / 2, height) : 0;
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * One tooltip for every chart. Values lead and series names follow, each keyed
 * with a short stroke rather than a box. Positioned inside the chart frame and
 * flipped near the right edge so it is never cut off.
 */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  title,
  rows,
}: {
  x: number;
  y: number;
  containerWidth: number;
  title: string;
  rows: TooltipRow[];
}) {
  const flip = x > containerWidth - 170;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-32 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? containerWidth - x + 12 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      <p className="mb-1 text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            {row.color && (
              <span
                aria-hidden
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
            <span className="text-muted-foreground">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({
  items,
  className,
}: {
  items: Array<{ label: string; color: string; value?: string }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-medium text-foreground">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Arrow-key navigation shared by the charts that track a hovered index. */
export function stepIndex(
  event: React.KeyboardEvent,
  current: number | null,
  count: number,
): number | null | undefined {
  if (count === 0) return undefined;
  if (event.key === "ArrowRight") return current === null ? 0 : Math.min(count - 1, current + 1);
  if (event.key === "ArrowLeft") return current === null ? count - 1 : Math.max(0, current - 1);
  if (event.key === "Home") return 0;
  if (event.key === "End") return count - 1;
  if (event.key === "Escape") return null;
  return undefined;
}
