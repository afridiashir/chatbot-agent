"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What the team calls a client, editable in place.
 *
 * A matchmaker files people the way they can work with — "Umar -M1- 8344- LHR"
 * — so the chat has to carry that rather than only the name on the form. The
 * two are kept apart on purpose: what somebody told us they are called is a
 * record, and it stays in the contact panel underneath.
 *
 * The label belongs to the person, so saving it here relabels every chat they
 * have, and the visitor is never shown it.
 */
export function VisitorName({
  name,
  displayName,
  onRename,
  className,
}: {
  /** What they gave on the form, and the fallback. */
  name: string;
  /** What the team filed them under, when they have. */
  displayName?: string | null;
  onRename: (displayName: string) => Promise<void> | void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Someone else may have relabelled them while this was closed.
  useEffect(() => {
    if (!editing) setDraft(displayName ?? "");
  }, [displayName, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await onRename(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1", className)}>
        <span className="truncate">{displayName || name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={displayName ? `Edit the label for ${name}` : `Label ${name}`}
          title={displayName ? `Labelled: ${displayName}` : "Add your own label"}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-chat-meta opacity-60 transition hover:bg-accent hover:opacity-100"
        >
          <Pencil className="size-3" aria-hidden />
        </button>
      </span>
    );
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") {
            setDraft(displayName ?? "");
            setEditing(false);
          }
        }}
        maxLength={60}
        // The example the whole feature exists for.
        placeholder="Umar -M1- 8344- LHR"
        aria-label={`Label for ${name}`}
        className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-sm font-normal focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        aria-label="Save label"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-success transition hover:bg-accent disabled:opacity-40"
      >
        <Check className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          setDraft(displayName ?? "");
          setEditing(false);
        }}
        aria-label="Cancel"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-chat-meta transition hover:bg-accent"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
