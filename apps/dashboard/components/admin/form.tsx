"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Shared form pieces for the admin dialogs (agents, admins). */

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/** The first server-side message for each field of a validation failure. */
export function firstFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {};
  return Object.fromEntries(
    Object.entries(err.details).map(([key, messages]) => [key, messages[0] ?? ""]),
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium">
      {label}
      {children}
      {(error || hint) && (
        <span className={cn("font-normal", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
}

export function PasswordInput({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        placeholder="At least 10 characters"
        aria-invalid={invalid}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
