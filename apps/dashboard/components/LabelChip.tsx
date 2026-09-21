"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Tag, X } from "lucide-react";
import type { Label, LabelColor, LabelRef } from "@repo/types";
import { cn } from "@/lib/utils";

/**
 * One class per palette token rather than an interpolated string, because
 * Tailwind only keeps classes it can see written out at build time — a
 * `bg-${color}-100` would be compiled away and every chip would come out
 * unstyled.
 */
const CHIP: Record<LabelColor, string> = {
  grey: "bg-muted text-muted-foreground",
  green: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

/** The solid swatch used when picking a colour, where the chip tint is too faint. */
export const SWATCH: Record<LabelColor, string> = {
  grey: "bg-muted-foreground",
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
};

export function LabelChip({
  label,
  onRemove,
  className,
}: {
  label: LabelRef;
  /** Omitted where the chip is only being displayed, as in a read-only list. */
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        CHIP[label.color],
        className,
      )}
    >
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove label ${label.name}`}
          className="-mr-0.5 shrink-0 rounded-full opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * The chips on a conversation plus the menu that adds another.
 *
 * Both sides of the change are reported to `onToggle`, which is expected to
 * call the API and hand back the new set. The menu stays open while several
 * labels are added, because labelling a chat is usually more than one tap.
 */
export function LabelBar({
  labels,
  available,
  onToggle,
  disabled,
  className,
}: {
  labels: LabelRef[];
  available: Label[];
  onToggle: (labelId: string, next: "on" | "off") => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // A menu that stays open after you look away is a nuisance on a dense screen.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const applied = new Set(labels.map((label) => label.id));

  return (
    <div ref={ref} className={cn("relative flex flex-wrap items-center gap-1", className)}>
      {labels.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          onRemove={disabled ? undefined : () => onToggle(label.id, "off")}
        />
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-label="Add a label"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {labels.length === 0 ? <Tag className="size-3" /> : <Plus className="size-3" />}
        {labels.length === 0 ? "Label" : "Add"}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-30 mt-1 max-h-64 w-52 overflow-y-auto rounded-lg border bg-card p-1 shadow-lg"
        >
          {available.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No labels yet. An admin can add them under Labels.
            </p>
          )}
          {available.map((label) => {
            const on = applied.has(label.id);
            return (
              <button
                key={label.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(label.id, on ? "off" : "on")}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", SWATCH[label.color])} />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                {on && <Check className="size-3.5 shrink-0 text-success" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
