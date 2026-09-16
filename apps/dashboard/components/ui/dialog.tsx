"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A modal built on the native <dialog>. `showModal()` gives focus trapping,
 * Escape to close, inert page content and a top-layer backdrop for free, so
 * none of it has to be reimplemented here.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  tone = "default",
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** `danger` tints the icon red for destructive confirmations. */
  tone?: "default" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first focusable element, which is the close
      // button; React's autoFocus sets no attribute for it to honour. Put the
      // cursor in the first field instead so the reader can type straight away.
      dialog.querySelector<HTMLElement>("input, textarea, select")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Escape fires `cancel`; route it through onClose so state stays the owner.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click that lands on the <dialog> itself, not its content, is the backdrop.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]",
        "open:animate-in open:fade-in-0 open:zoom-in-95",
        className,
      )}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3">
            {icon && (
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  tone === "danger"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-success-soft text-primary",
                )}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 id="dialog-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
