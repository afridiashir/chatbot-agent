"use client";

import { useWidth } from "./shared";

/**
 * A stat tile's trend: the history in the de-emphasis grey, with only the
 * latest point in the accent so the eye lands on "now".
 */
export function Sparkline({ values, height = 32 }: { values: number[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const pad = 4;
  const max = Math.max(1, ...values);
  const last = values.length - 1;
  const xAt = (i: number) => pad + (last <= 0 ? 0 : (i / last) * (width - pad * 2));
  const yAt = (v: number) => pad + (height - pad * 2) * (1 - v / max);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`).join(" ");

  return (
    <div ref={ref} className="w-full" style={{ height }} aria-hidden>
      {width > 0 && values.length > 1 && (
        <svg width={width} height={height}>
          <path
            d={d}
            fill="none"
            stroke="var(--chart-muted)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={xAt(last)}
            cy={yAt(values[last]!)}
            r={3}
            fill="var(--chart-1)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        </svg>
      )}
    </div>
  );
}
