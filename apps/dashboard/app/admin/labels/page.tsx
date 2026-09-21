"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Lock, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import {
  LABEL_COLORS,
  type Label as LabelType,
  type LabelColor,
  type LabelWithUsage,
} from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { LabelChip, SWATCH } from "@/components/LabelChip";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, firstFieldErrors } from "@/components/admin/form";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; label: LabelWithUsage }
  | { kind: "delete"; label: LabelWithUsage }
  | null;

export default function AdminLabelsPage() {
  return <AdminShell>{({ token }) => <Labels token={token} />}</AdminShell>;
}

function Labels({ token }: { token: string }) {
  const [labels, setLabels] = useState<LabelWithUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLabels(await api<LabelWithUsage[]>("/api/admin/labels", { token }));
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load labels"));
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function remove(label: LabelWithUsage) {
    setBusyId(label.id);
    setError(null);
    try {
      await api(`/api/admin/labels/${label.id}`, { method: "DELETE", token });
      await refresh();
      setDialog(null);
      setNotice(`${label.name} deleted`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Labels</h1>
          <p className="text-sm text-muted-foreground">
            {labels
              ? `${labels.length} label${labels.length === 1 ? "" : "s"}. Agents and admins put these on a chat; one chat can carry several.`
              : "Loading labels…"}
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-4" aria-hidden />
          Add label
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4" aria-hidden />
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        {labels?.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-primary">
              <Tag className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold">No labels yet</p>
          </div>
        )}
        {labels?.map((label) => (
          <div
            key={label.id}
            className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <span className={cn("size-3 shrink-0 rounded-full", SWATCH[label.color])} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <LabelChip label={label} />
                {label.isSystem && (
                  <span
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                    title="Every new chat is given this label"
                  >
                    <Lock className="size-3" aria-hidden />
                    Given to every new chat
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                On {label.conversationCount} chat{label.conversationCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "edit", label })}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
            {/* The system label has no Delete: the server refuses it, and a
                button that always fails is worse than no button. */}
            {!label.isSystem && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busyId === label.id}
                onClick={() => setDialog({ kind: "delete", label })}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Deleting a label takes it off every chat carrying it. The chats themselves are untouched.
        The label every new chat starts with can be renamed and recoloured, but not deleted — chat
        creation depends on it.
      </p>

      <LabelDialog
        token={token}
        state={dialog?.kind === "create" || dialog?.kind === "edit" ? dialog : null}
        onClose={() => setDialog(null)}
        onSaved={async (message) => {
          await refresh();
          setDialog(null);
          setError(null);
          setNotice(message);
        }}
      />

      <Dialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "delete" ? `Delete ${dialog.label.name}?` : "Delete"}
        description={
          dialog?.kind === "delete"
            ? `It will be removed from ${dialog.label.conversationCount} chat${dialog.label.conversationCount === 1 ? "" : "s"}. The chats themselves are not affected.`
            : undefined
        }
        icon={<Trash2 className="size-5" aria-hidden />}
        tone="danger"
      >
        {dialog?.kind === "delete" && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === dialog.label.id}
              onClick={() => void remove(dialog.label)}
            >
              {busyId === dialog.label.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function LabelDialog({
  token,
  state,
  onClose,
  onSaved,
}: {
  token: string;
  state: { kind: "create" } | { kind: "edit"; label: LabelWithUsage } | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const editing = state?.kind === "edit" ? state.label : null;
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("grey");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog is opened for a different label.
  useEffect(() => {
    if (!state) return;
    setName(editing?.name ?? "");
    setColor(editing?.color ?? "grey");
    setErrors({});
  }, [state, editing]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      if (editing) {
        await api<LabelType>(`/api/admin/labels/${editing.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ name, color }),
        });
        await onSaved(`${name} updated`);
      } else {
        await api<LabelType>("/api/admin/labels", {
          method: "POST",
          token,
          body: JSON.stringify({ name, color }),
        });
        await onSaved(`${name} added`);
      }
    } catch (err) {
      const fields = firstFieldErrors(err);
      setErrors(
        Object.keys(fields).length
          ? fields
          : { name: err instanceof ApiError ? err.message : "Something went wrong" },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "Add a label"}
      description={
        editing?.isSystem
          ? "This is the label every new chat is given. Renaming it changes what future chats start with."
          : undefined
      }
      icon={<Tag className="size-5" aria-hidden />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Follow up"
            maxLength={32}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>

        <div className="flex flex-col gap-1.5 text-xs font-medium">
          Colour
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
            {LABEL_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={option}
                onClick={() => setColor(option)}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow",
                  SWATCH[option],
                  color === option && "ring-2 ring-ring",
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <LabelChip label={{ id: "preview", name: name.trim() || "Preview", color }} />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || name.trim().length === 0}>
              {saving ? "Saving…" : editing ? "Save" : "Add label"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
