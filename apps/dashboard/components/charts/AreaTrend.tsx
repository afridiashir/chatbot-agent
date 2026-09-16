"use client";

import { useState } from "react";
import { ChartTooltip, formatNumber, labelStride, niceScale, stepIndex, useWidth } from "./shared";

export interface TrendPoint {
  key: string;
  /** Short axis label, e.g. "Sep 15". */
  label: string;
  /** Tooltip heading, e.g. "Tuesday, Sep 15". */
  title: string;
  value: number;
}

const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 };

/**
 * A single series over time: a 2px line over a 10% wash. The crosshair snaps
 * to the nearest day, so readers aim at a date rather than at the line.
 */
export function AreaTrend({
  points,
  seriesName,
  color = "var(--chart-1)",
  height = 220,
  empty,
}: {
  points: TrendPoint[];
  seriesName: string;
  color?: string;
  height?: number;
  /** Shown over the empty axes when there is nothing to plot. */
  empty?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const scale = niceScale(Math.max(0, ...points.map((p) => p.value)));

  const xAt = (i: number) =>
    MARGIN.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yAt = (v: number) => MARGIN.top + plotH - (v / scale.max) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.value)}`).join(" ");
  const area =
    points.length > 0 ? `${line} L${xAt(points.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z` : "";

  const stride = labelStride(points.length, plotW);
  const last = points.length - 1;
  const current = active !== null ? points[active] : undefined;

  function pick(clientX: number, rect: DOMRect) {
    if (points.length === 0) return;
    const ratio = (clientX - rect.left - MARGIN.left) / Math.max(1, plotW);
    setActive(Math.max(0, Math.min(last, Math.round(ratio * last))));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${seriesName} per day. Use arrow keys to read each day.`}
          tabIndex={0}
          className="touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            const next = stepIndex(e, active, points.length);
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

          {points.map((p, i) =>
            i % stride === 0 || (i === last && last % stride > stride / 2) ? (
              <text
                key={p.key}
                x={xAt(i)}
                y={height - 8}
                textAnchor={i === 0 && points.length > 1 ? "start" : i === last ? "end" : "middle"}
                className="fill-[var(--chart-tick)] text-[10px]"
              >
                {p.label}
              </text>
            ) : null,
          )}

          <path d={area} fill={color} fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {current && active !== null && (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={MARGIN.top}
              y2={yAt(0)}
              stroke="var(--chart-axis)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}

          {points.length > 0 && (
            <circle
              cx={xAt(active ?? last)}
              cy={yAt(points[active ?? last]!.value)}
              r={4}
              fill={color}
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
        </svg>
      )}

      {empty && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      )}

      {current && active !== null && (
        <ChartTooltip
          x={xAt(active)}
          y={yAt(current.value)}
          containerWidth={width}
          title={current.title}
          rows={[{ label: seriesName, value: formatNumber(current.value), color }]}
        />
      )}
    </div>
  );
}
