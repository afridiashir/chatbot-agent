"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Send } from "lucide-react";
import type { ConversationDetail, Message } from "@repo/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatClock, formatDateSeparator, isNewDay } from "@/lib/format";
import { loadDrafts, saveDraft, type QueuedMessage } from "@/lib/outbox";

interface ConversationViewProps {
  detail: ConversationDetail | null;
  connected: boolean;
  visitorTyping: boolean;
  /** Sent but not yet stored by the server. */
  pending: QueuedMessage[];
  onSend: (content: string) => Promise<void>;
  onTyping: () => void;
  onClose: (conversationId: string) => Promise<void>;
}

/** A message the agent has sent that the server has not confirmed yet. */
function PendingBubble({ message }: { message: QueuedMessage }) {
  return (
    <div className="flex justify-end">
      <div className="chat-bubble-out max-w-[75%] min-w-24 px-2.5 py-1.5 opacity-70 shadow-sm">
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <span className="float-right mt-0.5 ml-2 flex items-center gap-1 text-[10px] leading-none text-chat-meta">
          <Clock className="h-2.5 w-2.5" aria-hidden="true" />
          <span className="sr-only">Waiting to send</span>
          {formatClock(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

/** Three dots, staggered so they ripple. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-chat-meta"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-md bg-chat-panel px-2.5 py-1 text-[11px] font-medium text-chat-meta shadow-sm">
        {formatDateSeparator(iso)}
      </span>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const fromAgent = message.senderType === "AGENT";

  return (
    <div className={fromAgent ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[75%] min-w-24 px-2.5 py-1.5 shadow-sm",
          fromAgent ? "chat-bubble-out" : "chat-bubble-in",
        ].join(" ")}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        {/* Sits on the trailing edge of the last line, the way a chat app does. */}
        <span className="float-right mt-0.5 ml-2 text-[10px] leading-none text-chat-meta">
          {formatClock(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function ConversationView({
  detail,
  connected,
  visitorTyping,
  pending,
  onSend,
  onTyping,
  onClose,
}: ConversationViewProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const conversationId = detail?.id ?? null;

  // Drafts are per conversation and survive a reload, so switching away from a
  // half-written reply does not throw it away.
  useEffect(() => {
    setDraft(conversationId ? (loadDrafts()[conversationId] ?? "") : "");
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, pending.length, visitorTyping]);

  if (!detail) {
    return (
      <div className="chat-canvas flex flex-1 items-center justify-center">
        <p className="rounded-full bg-chat-panel px-4 py-2 text-sm text-chat-meta shadow-sm">
          Select a conversation to open it
        </p>
      </div>
    );
  }

  const isClosed = detail.status === "CLOSED";
  // Deliberately not gated on `connected`: an offline send is queued, not lost.
  const canSend = !isClosed && !sending && draft.trim().length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    const content = draft.trim();
    setSending(true);
    setDraft("");
    if (conversationId) saveDraft(conversationId, "");
    try {
      await onSend(content);
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    if (!detail) return;
    setClosing(true);
    try {
      await onClose(detail.id);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b bg-chat-panel px-4 py-2.5">
        <Avatar name={detail.visitor.name} seed={detail.visitor.id} size="md" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{detail.visitor.name}</p>
          {visitorTyping ? (
            <p className="text-xs font-medium text-emerald-600">typing...</p>
          ) : (
            <p className="truncate text-xs text-chat-meta">
              <a href={`mailto:${detail.visitor.email}`} className="hover:underline">
                {detail.visitor.email}
              </a>
              {" · "}
              <a href={`tel:${detail.visitor.phone}`} className="hover:underline">
                {detail.visitor.phone}
              </a>
            </p>
          )}
        </div>

        {!isClosed && (
          <Button variant="outline" size="sm" onClick={handleClose} disabled={closing}>
            {closing ? "Closing..." : "Close conversation"}
          </Button>
        )}
      </header>

      <div className="chat-canvas flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3">
        {detail.messages.map((message, index) => (
          <div key={message.id} className="flex flex-col gap-1.5">
            {isNewDay(message.createdAt, detail.messages[index - 1]?.createdAt) && (
              <DaySeparator iso={message.createdAt} />
            )}
            <Bubble message={message} />
          </div>
        ))}

        {pending.map((message) => (
          <PendingBubble key={message.clientId} message={message} />
        ))}

        {visitorTyping && (
          <div className="flex justify-start" aria-live="polite">
            <div className="chat-bubble-in flex items-center gap-2 px-3 py-2 shadow-sm">
              <TypingDots />
              <span className="text-xs text-chat-meta">{detail.visitor.name} is typing</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {isClosed ? (
        <p className="border-t bg-chat-panel px-4 py-3 text-sm text-chat-meta">
          This conversation is closed and no longer counts toward your active load.
        </p>
      ) : (
        <form
          onSubmit={submit}
          className="flex items-center gap-2 border-t bg-chat-panel px-3 py-2.5"
        >
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (conversationId) saveDraft(conversationId, e.target.value);
              onTyping();
            }}
            placeholder={connected ? "Type a reply..." : "Offline - messages will send on reconnect"}
            aria-label="Reply"
            className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm placeholder:text-chat-meta focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
