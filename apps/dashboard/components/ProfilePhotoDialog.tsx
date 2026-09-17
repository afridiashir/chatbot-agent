"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { AVATAR_RULES, type Agent } from "@repo/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { checkAvatar, removeAvatar, uploadAvatar } from "@/lib/media";

/**
 * Sets or removes an agent's profile photo, either their own or, with
 * `asAdmin`, one an admin manages. It shows next to their name across the
 * dashboard and, for visitors, in the website chat widget.
 */
export function ProfilePhotoDialog({
  open,
  onClose,
  agent,
  token,
  onChange,
  asAdmin = false,
}: {
  open: boolean;
  onClose: () => void;
  agent: Agent;
  token: string;
  onChange: (agent: Agent) => void;
  asAdmin?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setProgress(null);
    }
  }, [open]);

  // The local preview holds the file in memory until revoked.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(picked: File | undefined) {
    setError(null);
    if (!picked) return;
    const problem = checkAvatar(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setFile(picked);
  }

  async function save() {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      onChange(await uploadAvatar({ agentId: agent.id, token, file, asAdmin, onProgress: setProgress }));
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : "Could not save the photo",
      );
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      onChange(await removeAvatar(agent.id, token, asAdmin));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the photo");
    } finally {
      setRemoving(false);
    }
  }

  const busy = progress !== null || removing;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={asAdmin ? `${agent.name}'s photo` : "Profile photo"}
      description={
        asAdmin
          ? "Visitors see it next to this agent's name in the chat widget, including chats open right now."
          : "Visitors see it next to your name in the chat widget."
      }
      icon={<Camera className="size-5" aria-hidden />}
    >
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Choose a photo"
          className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview
            <img src={preview} alt="" className="size-32 rounded-full object-cover" />
          ) : (
            <Avatar
              name={agent.name}
              seed={agent.id}
              photo={agent.avatarUrl}
              size="lg"
              className="[&>*]:size-32 [&>*]:text-3xl"
            />
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-5" aria-hidden />
            {agent.avatarUrl || preview ? "Change" : "Add photo"}
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_RULES.mimeTypes.join(",")}
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <p className="text-center text-xs text-muted-foreground">
          JPEG, PNG or WebP, up to {AVATAR_RULES.maxBytes / 1024 / 1024} MB. A square photo of{" "}
          {asAdmin ? "their" : "your"} face works best.
        </p>

        {progress !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-center text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex w-full items-center justify-between gap-2">
          {agent.avatarUrl && !file ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void remove()}
              disabled={busy}
            >
              <Trash2 className="size-4" aria-hidden />
              {removing ? "Removing…" : "Remove photo"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {file ? (
              <Button onClick={() => void save()} disabled={busy}>
                {progress !== null ? `Saving ${Math.round(progress * 100)}%` : "Save photo"}
              </Button>
            ) : (
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                {agent.avatarUrl ? "Choose new photo" : "Choose photo"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
