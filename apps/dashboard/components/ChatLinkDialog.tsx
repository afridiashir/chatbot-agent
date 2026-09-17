"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { API_URL, WIDGET_BASE_URL } from "@/lib/config";

export type ChatLinkTarget =
  | { kind: "agent"; id: string; name: string }
  | { kind: "branch"; id: string; name: string };

/** The hosted chat page for one agent or branch. */
export function chatLinkFor(target: ChatLinkTarget): string {
  return `${WIDGET_BASE_URL}/chat?${target.kind}=${encodeURIComponent(target.id)}`;
}

function embedCodeFor(target: ChatLinkTarget): string {
  return [
    "<script",
    `  src="${WIDGET_BASE_URL}/widget.js?${target.kind}=${encodeURIComponent(target.id)}"`,
    "  data-acme-chat",
    `  data-api-url="${API_URL}"`,
    "  defer",
    "></script>",
  ].join("\n");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      aria-label={label}
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/**
 * The chat link for one agent or one branch, and the same thing as a website
 * embed. An agent's link always reaches that agent, even while they're away;
 * a branch's link reaches whoever is free in that branch.
 */
export function ChatLinkDialog({
  target,
  onClose,
}: {
  target: ChatLinkTarget | null;
  onClose: () => void;
}) {
  const link = target ? chatLinkFor(target) : "";
  const embed = target ? embedCodeFor(target) : "";

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? `${target.name}'s chat link` : "Chat link"}
      icon={<Link2 className="size-5" aria-hidden />}
      description={
        target?.kind === "agent"
          ? "Chats from this link always go to this agent, even when they're offline. They reply when they're back."
          : "Chats from this link go to whoever is online in this branch. Visitors aren't asked to pick a branch."
      }
    >
      {target && (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Share a link</h3>
            <p className="text-xs text-muted-foreground">
              For WhatsApp, Instagram, email or a QR code. Opens a full-page chat.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                aria-label="Chat link"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-1.5 font-mono text-xs"
              />
              <CopyButton value={link} label="Copy chat link" />
              <Button variant="ghost" size="sm" onClick={() => window.open(link, "_blank", "noopener")}>
                <ExternalLink className="size-3.5" aria-hidden />
                Open
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Add to a website</h3>
                <p className="text-xs text-muted-foreground">
                  Paste before <code className="font-mono">&lt;/body&gt;</code>. The site must be on
                  the server&apos;s allowed websites list.
                </p>
              </div>
              <CopyButton value={embed} label="Copy embed code" />
            </div>
            <textarea
              readOnly
              value={embed}
              rows={6}
              aria-label="Embed code"
              onFocus={(event) => event.currentTarget.select()}
              className="resize-none rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs"
            />
          </section>
        </div>
      )}
    </Dialog>
  );
}
