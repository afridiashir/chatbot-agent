"use client";

import { useState } from "react";
import {
  ChartTooltip,
  columnPath,
  formatNumber,
  labelStride,
  niceScale,
  stepIndex,
  useWidth,
} from "./shared";

export interface ColumnSeries {
  key: string;
  name: string;
  color: string;
}

export interface ColumnDatum {
  key: string;
  label: string;
  title: string;
  values: Record<string, number>;
}

const MARGIN = { top: 12, right: 8, bottom: 28, left: 36 };
/** The surface-coloured gap between stacked segments. */
const GAP = 2;

/**
 * Vertical columns, stacked when given more than one series. Each column's
 * whole band is its hit target, and the tooltip lists every series in it.
 */
export function Columns({
  data,
  series,
  height = 220,
  empty,
  ariaLabel,
}: {
  data: ColumnDatum[];
  series: ColumnSeries[];
  height?: number;
  /** Shown over the empty axes when there is nothing to plot. */
  empty?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0));
  const scale = niceScale(Math.max(0, ...totals));

  const band = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const yAt = (v: number) => MARGIN.top + plotH - (v / scale.max) * plotH;
  const stride = labelStride(data.length, plotW, 40);
  const current = active !== null ? data[active] : undefined;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${ariaLabel}. Use arrow keys to read each column.`}
          tabIndex={0}
          className="touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            const next = stepIndex(e, active, data.length);
            if (next !== undefined) {
              e.preventDefault();
              setActive(next);
            }
          }}
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={MARGIN.left - 8}
                y={yAt(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-[var(--chart-tick)] text-[10px] tabular-nums"
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const bandX = MARGIN.left + i * band;
            const x = bandX + (band - barW) / 2;
            const topIndex = series.reduce(
              (top, s, si) => ((d.values[s.key] ?? 0) > 0 ? si : top),
              -1,
            );
            let base = 0;
            const dim = active !== null && active !== i;

            return (
              <g key={d.key} opacity={dim ? 0.45 : 1} className="transition-opacity">
                {series.map((s, si) => {
                  const value = d.values[s.key] ?? 0;
                  if (value <= 0) return null;
                  const y0 = yAt(base);
                  base += value;
                  const y1 = yAt(base);
                  // Every segment above the first gives up GAP px at its base.
                  const inset = si > 0 && base - value > 0 ? GAP : 0;
                  return (
                    <path
                      key={s.key}
                      d={columnPath(x, y1, barW, y0 - y1 - inset, si === topIndex)}
                      fill={s.color}
                    />
                  );
                })}
                {i % stride === 0 ? (
                  <text
                    x={bandX + band / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-[var(--chart-tick)] text-[10px]"
                  >
                    {d.label}
                  </text>
                ) : null}
                <rect
                  x={bandX}
                  y={MARGIN.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {empty && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      )}

      {current && active !== null && (
        <ChartTooltip
          x={MARGIN.left + active * band + band / 2}
          y={yAt(totals[active] ?? 0)}
          containerWidth={width}
          title={current.title}
          rows={[...series].reverse().map((s) => ({
            label: s.name,
            value: formatNumber(current.values[s.key] ?? 0),
            color: s.color,
          }))}
        />
      )}
    </div>
  );
}
