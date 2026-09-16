"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TableColumn<Row> {
  header: string;
  cell: (row: Row) => React.ReactNode;
  numeric?: boolean;
}

/**
 * The frame every chart sits in. The table view is the chart's accessible
 * twin: everything a tooltip shows is also readable here without hovering.
 */
export function ChartCard<Row>({
  title,
  icon: Icon,
  description,
  legend,
  rows,
  columns,
  rowKey,
  className,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  description?: string;
  legend?: React.ReactNode;
  rows: Row[];
  columns: TableColumn<Row>[];
  rowKey: (row: Row) => string;
  className?: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-sm", className)}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div
          role="tablist"
          aria-label={`${title} view`}
          className="flex rounded-md border p-0.5 text-[11px] font-medium"
        >
          {(["chart", "table"] as const).map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                "rounded px-2 py-0.5 capitalize text-muted-foreground transition-colors hover:text-foreground",
                view === option && "bg-accent text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      {legend && view === "chart" && <div className="mb-3">{legend}</div>}

      {view === "chart" ? (
        children
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.header}
                    scope="col"
                    className={cn(
                      "px-3 py-2 text-left font-medium text-muted-foreground",
                      column.numeric && "text-right",
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-t">
                  {columns.map((column) => (
                    <td
                      key={column.header}
                      className={cn("px-3 py-1.5", column.numeric && "text-right tabular-nums")}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
