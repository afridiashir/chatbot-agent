"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "./shared";

export interface BarListItem {
  key: string;
  label: string;
  /** Secondary line under the label, e.g. the agent's branch. */
  sublabel?: string;
  value: number;
  /** Extra detail revealed on hover and focus. */
  detail?: string;
  leading?: React.ReactNode;
}

/**
 * Horizontal bars for ranked categories with names too long for an x-axis.
 * One series, so one colour; the value is labelled at each bar's tip.
 */
export function BarList({
  items,
  color = "var(--chart-1)",
  empty = "Nothing in this range.",
}: {
  items: BarListItem[];
  color?: string;
  empty?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((item) => item.value));

  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const pct = (item.value / max) * 100;
        const isActive = active === item.key;
        return (
          <li
            key={item.key}
            tabIndex={0}
            onPointerEnter={() => setActive(item.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(item.key)}
            onBlur={() => setActive(null)}
            className={cn(
              "rounded-md px-1 py-0.5 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
              active !== null && !isActive && "opacity-60",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                {item.leading}
                <span className="truncate font-medium">{item.label}</span>
                {item.sublabel && (
                  <span className="truncate text-muted-foreground">{item.sublabel}</span>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {isActive && item.detail ? item.detail : null}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 min-w-0 flex-1">
                {item.value > 0 && (
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{ width: `${pct}%`, backgroundColor: color, minWidth: 3 }}
                  />
                )}
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                {formatNumber(item.value)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
