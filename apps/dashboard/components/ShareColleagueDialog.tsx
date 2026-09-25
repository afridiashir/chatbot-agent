"use client";

import { useEffect, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import type { PublicAgentProfile } from "@repo/types";
import { chatLinkFor } from "@/components/ChatLinkDialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** What an agent says when handing someone on. Editable before it goes. */
const introduction = (colleague: string, link: string) =>
  `You can talk to ${colleague} about this — here's their chat: ${link}`;

/**
 * Handing a visitor on to a colleague.
 *
 * Not a transfer: the chat stays where it is and the visitor decides. They are
 * sent that colleague's own chat link, which opens a conversation with them —
 * so the visitor can end up talking to both, which is the point of a widget
 * that holds more than one chat at a time.
 *
 * Only the agent's own branch is offered, because that is who they actually
 * work with, and the server enforces it rather than trusting this list.
 */
export function ShareColleagueDialog({
  open,
  agentId,
  token,
  sending,
  onClose,
  onSend,
}: {
  open: boolean;
  agentId: string;
  token: string;
  sending: boolean;
  onClose: () => void;
  onSend: (message: string) => void | Promise<void>;
}) {
  const [colleagues, setColleagues] = useState<PublicAgentProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PublicAgentProfile | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setChosen(null);
    setMessage("");
    setError(null);
    void api<PublicAgentProfile[]>(`/api/agents/${agentId}/colleagues`, { token })
      .then(setColleagues)
      .catch(() => setError("Could not load your colleagues"));
  }, [open, agentId, token]);

  function pick(colleague: PublicAgentProfile) {
    setChosen(colleague);
    setMessage(
      introduction(
        colleague.name,
        chatLinkFor({ kind: "agent", id: colleague.id, name: colleague.name }),
      ),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share a colleague"
      description="They'll get a link that opens a chat with whoever you pick. This conversation stays with you."
      icon={<UserRoundPlus className="size-5" aria-hidden />}
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!colleagues && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

        {colleagues?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            There is nobody else in your branch to share.
          </p>
        )}

        {colleagues && colleagues.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            {colleagues.map((colleague) => (
              <button
                key={colleague.id}
                type="button"
                onClick={() => pick(colleague)}
                aria-pressed={chosen?.id === colleague.id}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent",
                  chosen?.id === colleague.id && "bg-accent",
                )}
              >
                <span className="relative shrink-0">
                  <Avatar name={colleague.name} seed={colleague.id} size="md" />
                  {colleague.isOnline && (
                    <span
                      className="absolute right-0 bottom-0 size-2.5 rounded-full bg-online ring-2 ring-card"
                      aria-label="online"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{colleague.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {colleague.isOnline ? "Online now" : "Away — replies when back"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {chosen && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              What the visitor will see
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              aria-label="Message"
              className="resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={sending || !chosen || message.trim().length === 0}
            onClick={() => void onSend(message.trim())}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
