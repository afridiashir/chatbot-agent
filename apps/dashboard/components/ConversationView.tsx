"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock,
  FileAudio,
  Film,
  Mic,
  Paperclip,
  Reply,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  kindForFile,
  type AttachmentKind,
  type ConversationDetail,
  type Message,
  type MessageQuote,
} from "@repo/types";
import { EmojiPicker } from "@/components/EmojiPicker";
import { ReactionBar } from "@/components/ReactionBar";
import { MessageMedia } from "@/components/MessageMedia";
import { LiveWaveform } from "@/components/Waveform";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LIVE_BARS, formatDuration, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useSwipeReply } from "@/hooks/useSwipeReply";
import { useLongPress } from "@/hooks/useLongPress";
import { isJumboEmoji } from "@/lib/emoji";
import { quoteText, toQuote } from "@/lib/quote";
import { formatClock, formatDateSeparator, isNewDay } from "@/lib/format";
import { ReceiptTicks } from "@/components/ReceiptTicks";
import { checkFile } from "@/lib/media";
import { loadDrafts, saveDraft, type QueuedMessage } from "@/lib/outbox";
import { cn } from "@/lib/utils";

export interface MediaSend {
  kind: AttachmentKind;
  file: Blob;
  fileName: string;
  caption: string;
  durationMs?: number;
  waveform?: number[];
  /** Set when the media is a reply to an earlier message. */
  replyToId?: string;
  onProgress: (fraction: number) => void;
}

interface ConversationViewProps {
  detail: ConversationDetail | null;
  connected: boolean;
  visitorTyping: boolean;
  /** Sent but not yet stored by the server. */
  pending: QueuedMessage[];
  onSend: (content: string) => Promise<void>;
  /** Uploads and sends one media message; rejects with a readable error. */
  onSendMedia: (media: MediaSend) => Promise<void>;
  /** Adds, replaces or removes this agent's reaction; null takes it back. */
  onReact?: (messageId: string, emoji: string | null) => void;
  onTyping: () => void;
  onClose: (conversationId: string) => Promise<void>;
}

/** A message the agent has sent that the server has not confirmed yet. */
function PendingBubble({
  message,
  names,
}: {
  message: QueuedMessage;
  names: { agent: string; visitor: string };
}) {
  return (
    <div className="flex justify-end">
      <div className="chat-bubble-out max-w-[75%] min-w-24 px-2.5 py-1.5 opacity-70 shadow-sm">
        {message.replyTo && (
          <div className="chat-quote mb-1 px-2 py-1">
            <p className="text-xs font-medium text-primary">
              {message.replyTo.senderType === "AGENT" ? names.agent : names.visitor}
            </p>
            <p className="truncate text-xs text-chat-meta">{quoteText(message.replyTo)}</p>
          </div>
        )}
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
export function TypingDots() {
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

export function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-md bg-chat-panel px-2.5 py-1 text-[11px] font-medium text-chat-meta shadow-sm">
        {formatDateSeparator(iso)}
      </span>
    </div>
  );
}

/** Time plus, on the agent's own messages, WhatsApp's grey "delivered" ticks. */
function Stamp({ message, outgoing }: { message: Message; outgoing: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {formatClock(message.createdAt)}
      {outgoing && <ReceiptTicks message={message} />}
    </span>
  );
}

export function Bubble({
  message,
  sender,
  names,
  flash,
  reacting,
  onReply,
  onReact,
  onOpenReactions,
  onCloseReactions,
  onMoreEmoji,
  onJumpTo,
  registerRef,
}: {
  message: Message;
  /** Who sent it; voice notes show their photo. */
  sender?: { name: string; seed: string; photo?: string | null };
  /** Names for the quote header. Omitted in read-only views. */
  names?: { agent: string; visitor: string };
  /** Briefly highlighted because a reply's quote pointed here. */
  flash?: boolean;
  /** The reaction bar is open on this message. */
  reacting?: boolean;
  /** Omitted where replying isn't possible, such as the admin's read-only view. */
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string | null) => void;
  onOpenReactions?: (messageId: string) => void;
  onCloseReactions?: () => void;
  onMoreEmoji?: (messageId: string) => void;
  onJumpTo?: (messageId: string) => void;
  registerRef?: (messageId: string, element: HTMLDivElement | null) => void;
}) {
  const fromAgent = message.senderType === "AGENT";
  const media = message.attachment;
  // A voice note without a caption owns the whole bubble, footer included.
  const bareVoice = media?.kind === "VOICE" && !message.content;
  const swipe = useSwipeReply(Boolean(onReply), () => onReply?.(message));
  const longPress = useLongPress(() => onOpenReactions?.(message.id));
  const mine = message.reactions.find((r) => r.senderType === "AGENT")?.emoji ?? null;
  const quoteName = (quote: MessageQuote) =>
    quote.senderType === "AGENT" ? (names?.agent ?? "Agent") : (names?.visitor ?? "Visitor");

  return (
    <div
      ref={(element) => registerRef?.(message.id, element)}
      className={cn(
        "chat-hold group relative flex items-center gap-1",
        fromAgent ? "justify-end" : "justify-start",
        flash && "chat-flash",
      )}
      style={{ touchAction: "pan-y" }}
      {...swipe.handlers}
      onTouchStart={(event) => {
        swipe.handlers.onTouchStart?.(event);
        longPress.onTouchStart(event);
      }}
      onTouchMove={(event) => {
        swipe.handlers.onTouchMove?.(event);
        longPress.onTouchMove(event);
      }}
      onTouchEnd={() => {
        swipe.handlers.onTouchEnd?.();
        longPress.onTouchEnd();
      }}
      onTouchCancel={() => {
        swipe.handlers.onTouchCancel?.();
        longPress.onTouchCancel();
      }}
    >
      {reacting && onReact && (
        <div className={cn("absolute bottom-full z-20 mb-1", fromAgent ? "right-0" : "left-0")}>
          <ReactionBar
            mine={mine}
            onPick={(emoji) => {
              onReact(message.id, emoji);
              onCloseReactions?.();
            }}
            onMore={() => onMoreEmoji?.(message.id)}
            onClose={() => onCloseReactions?.()}
          />
        </div>
      )}
      {swipe.swiping && (
        <span
          aria-hidden
          className="absolute top-1/2 left-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-chat-meta"
          style={{ opacity: Math.min(1, swipe.offset / 46) }}
        >
          <Reply className="size-4" />
        </span>
      )}

      {/* Beside the bubble on its outer side: left of the agent's own messages,
          right of the visitor's. Sized even while hidden, so the row does not
          jump as the pointer moves over it. */}
      {onReply && fromAgent && (
        <>
          {onOpenReactions && <ReactButton onClick={() => onOpenReactions(message.id)} />}
          <ReplyButton onClick={() => onReply(message)} />
        </>
      )}

      <div
        className={cn(
          "max-w-[75%] min-w-24 shadow-sm",
          media ? "p-1" : "px-2.5 py-1.5",
          fromAgent ? "chat-bubble-out" : "chat-bubble-in",
        )}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo?.(message.replyTo!.id)}
            className={cn(
              "chat-quote mb-1 block w-full px-2 py-1 text-left",
              media && "mx-0.5 mt-0.5 w-auto",
            )}
          >
            <span className="block text-xs font-medium text-primary">
              {quoteName(message.replyTo)}
            </span>
            <span className="block truncate text-xs text-chat-meta">
              {quoteText(message.replyTo)}
            </span>
          </button>
        )}
        {media && (
          <MessageMedia
            attachment={media}
            outgoing={fromAgent}
            sender={sender}
            footer={bareVoice ? <Stamp message={message} outgoing={fromAgent} /> : undefined}
          />
        )}
        {message.content && (
          <p
            className={cn(
              "whitespace-pre-wrap break-words",
              media && "px-1.5 pt-1",
              // A message that is nothing but a few emoji is shown large.
              !media && isJumboEmoji(message.content)
                ? "py-1 text-[2.25rem] leading-tight"
                : "text-sm",
            )}
          >
            {message.content}
          </p>
        )}
        {!bareVoice && (
          // Sits on the trailing edge of the last line, the way a chat app does.
          <span
            className={cn(
              "float-right mt-0.5 ml-2 text-[10px] leading-none text-chat-meta",
              media && "mr-1.5 mb-0.5",
            )}
          >
            <Stamp message={message} outgoing={fromAgent} />
          </span>
        )}

        {message.reactions.length > 0 && (
          <button
            type="button"
            disabled={!onReact}
            onClick={() => (mine ? onReact?.(message.id, null) : onOpenReactions?.(message.id))}
            aria-label={mine ? "Remove your reaction" : "React to this message"}
            title={mine ? "Click to remove your reaction" : "React"}
            className="emoji relative z-10 clear-both -mb-3 ml-1 flex translate-y-1 items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 text-[13px] leading-none shadow-sm"
          >
            {message.reactions.map((reaction) => (
              <span key={reaction.senderType}>{reaction.emoji}</span>
            ))}
          </button>
        )}
      </div>

      {onReply && !fromAgent && (
        <>
          <ReplyButton onClick={() => onReply(message)} />
          {onOpenReactions && <ReactButton onClick={() => onOpenReactions(message.id)} />}
        </>
      )}
    </div>
  );
}

/** The round react control that appears beside a message on hover. */
function ReactButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="React to this message"
      title="React"
      className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-chat-meta opacity-0 shadow-sm transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Smile className="size-3.5" aria-hidden />
    </button>
  );
}

/** The round reply control that appears beside a message on hover. */
function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Reply to this message"
      title="Reply"
      className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-chat-meta opacity-0 shadow-sm transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Reply className="size-3.5" aria-hidden />
    </button>
  );
}

export function ConversationView({
  detail,
  connected,
  visitorTyping,
  pending,
  onSend,
  onSendMedia,
  onReact,
  onTyping,
  onClose,
}: ConversationViewProps) {
  const [draft, setDraft] = useState("");
  const [closing, setClosing] = useState(false);
  /** The message being replied to, shown above the box until sent or dropped. */
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  /** Briefly highlighted after jumping to it from a quote. */
  const [flashId, setFlashId] = useState<string | null>(null);
  /** The message whose reaction bar is open, if any. */
  const [reactingId, setReactingId] = useState<string | null>(null);
  /** Set while the emoji panel is picking a reaction rather than typing. */
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());

  const registerRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) bubbleRefs.current.set(messageId, element);
    else bubbleRefs.current.delete(messageId);
  }, []);

  /** Clicking a quote scrolls to the original and flashes it. */
  const jumpTo = useCallback((messageId: string) => {
    const element = bubbleRefs.current.get(messageId);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashId(messageId);
  }, []);

  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(null), 1200);
    return () => clearTimeout(timer);
  }, [flashId]);

  const closeReactions = useCallback(() => setReactingId(null), []);

  /** "+" on the bar hands the choice to the full emoji panel. */
  const moreEmoji = useCallback((messageId: string) => {
    setReactingId(null);
    setReactionTarget(messageId);
  }, []);

  // A click anywhere else closes the reaction bar, as a popup should.
  useEffect(() => {
    if (!reactingId) return;
    const close = (event: Event) => {
      // A press on the bar is a reaction being picked, not a dismissal.
      const path = event.composedPath?.() ?? [];
      const onBar = path.some(
        (node) => node instanceof HTMLElement && node.hasAttribute("data-reaction-bar"),
      );
      if (onBar) return;
      setReactingId(null);
    };
    // Queued, so the click that opened it does not close it again.
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", close);
      window.addEventListener("keydown", close);
    });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [reactingId]);

  const scrollToLatest = useCallback((smooth = false) => {
    endRef.current?.scrollIntoView({ block: "end", ...(smooth ? { behavior: "smooth" } : {}) });
  }, []);

  // Starting a reply returns to the newest messages: the agent is about to
  // write, and their answer belongs in view.
  useEffect(() => {
    if (replyTo) scrollToLatest(true);
  }, [replyTo, scrollToLatest]);

  const conversationId = detail?.id ?? null;

  // Drafts are per conversation and survive a reload, so switching away from a
  // half-written reply does not throw it away.
  useEffect(() => {
    setDraft(conversationId ? (loadDrafts()[conversationId] ?? "") : "");
    setReplyTo(null);
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
      <header className="flex items-center gap-3 border-b bg-chat-header px-4 py-2.5">
        <Avatar name={detail.visitor.name} seed={detail.visitor.id} size="md" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{detail.visitor.name}</p>
          {visitorTyping ? (
            <p className="text-xs font-medium text-success">typing...</p>
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
            <Bubble
              message={message}
              names={{ agent: detail.agent.name, visitor: detail.visitor.name }}
              flash={flashId === message.id}
              onReply={isClosed ? undefined : setReplyTo}
              reacting={reactingId === message.id}
              onReact={isClosed ? undefined : onReact}
              onOpenReactions={isClosed ? undefined : setReactingId}
              onCloseReactions={closeReactions}
              onMoreEmoji={moreEmoji}
              onJumpTo={jumpTo}
              registerRef={registerRef}
              sender={
                message.senderType === "AGENT"
                  ? {
                      name: detail.agent.name,
                      seed: detail.agent.id,
                      photo: detail.agent.avatarUrl,
                    }
                  : { name: detail.visitor.name, seed: detail.visitor.id }
              }
            />
          </div>
        ))}

        {pending.map((message) => (
          <PendingBubble
            key={message.clientId}
            message={message}
            names={{ agent: detail.agent.name, visitor: detail.visitor.name }}
          />
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
        <p className="border-t bg-chat-header px-4 py-3 text-sm text-chat-meta">
          This conversation is closed and no longer counts toward your active load.
        </p>
      ) : (
        <Composer
          key={detail.id}
          conversationId={detail.id}
          draft={draft}
          onDraftChange={(value) => {
            setDraft(value);
            saveDraft(detail.id, value);
            onTyping();
          }}
          connected={connected}
          onActivity={scrollToLatest}
          reactionTarget={reactionTarget}
          onReaction={(messageId, emoji) => {
            onReact?.(messageId, emoji);
            setReactionTarget(null);
          }}
          onReactionCancel={() => setReactionTarget(null)}
          replyTo={replyTo}
          names={{ agent: detail.agent.name, visitor: detail.visitor.name }}
          onCancelReply={() => setReplyTo(null)}
          onSend={onSend}
          onSendMedia={onSendMedia}
        />
      )}
    </div>
  );
}

/* --------------------------------- composer -------------------------------- */

interface Staged {
  file: File;
  kind: Exclude<AttachmentKind, "VOICE">;
  previewUrl: string | null;
}

function Composer({
  conversationId,
  draft,
  onDraftChange,
  connected,
  onActivity,
  reactionTarget,
  onReaction,
  onReactionCancel,
  replyTo,
  names,
  onCancelReply,
  onSend,
  onSendMedia,
}: {
  conversationId: string;
  draft: string;
  onDraftChange: (value: string) => void;
  connected: boolean;
  /** Follow the newest messages: writing pushes them up behind the box. */
  onActivity: (smooth?: boolean) => void;
  /** Set while the emoji panel is choosing a reaction for this message. */
  reactionTarget: string | null;
  onReaction: (messageId: string, emoji: string) => void;
  onReactionCancel: () => void;
  /** The message this one will quote, or null. */
  replyTo: Message | null;
  names: { agent: string; visitor: string };
  onCancelReply: () => void;
  onSend: (content: string, replyTo?: MessageQuote | null) => Promise<void>;
  onSendMedia: (media: MediaSend) => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // "More emoji" on a reaction bar opens the same panel, in reaction mode.
  const pickingReaction = reactionTarget !== null;
  useEffect(() => {
    if (pickingReaction) setEmojiOpen(true);
  }, [pickingReaction]);
  /** Where an emoji goes: the caret, remembered while the panel has focus. */
  const caretRef = useRef<number | null>(null);
  const recorder = useVoiceRecorder();

  /** Drops the emoji in at the caret, or at the end when there is none. */
  function insertEmoji(emoji: string) {
    const box = boxRef.current;
    const at = box && box === document.activeElement ? box.selectionStart : caretRef.current;
    const caret = at ?? draft.length;
    onDraftChange(draft.slice(0, caret) + emoji + draft.slice(caret));

    const next = caret + emoji.length;
    caretRef.current = next;
    // After React has written the new value, put the caret after the emoji.
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(next, next);
    });
  }

  // One line until the text needs more, then taller up to the CSS max height.
  // Only a change of height is followed: scrolling on every keystroke would
  // drag the agent out of the history they were reading.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const before = box.offsetHeight;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
    if (box.offsetHeight !== before) onActivity();
  }, [draft, onActivity]);

  // Starting a reply puts the caret in the box, ready to type.
  useEffect(() => {
    if (!replyTo) return;
    const box = boxRef.current;
    box?.focus();
    box?.setSelectionRange(box.value.length, box.value.length);
  }, [replyTo]);

  // Object URLs hold the file in memory until revoked.
  useEffect(
    () => () => {
      if (staged?.previewUrl) URL.revokeObjectURL(staged.previewUrl);
    },
    [staged],
  );

  const hasText = draft.trim().length > 0;
  const busy = sending || progress !== null;

  function clearDraft() {
    onDraftChange("");
    saveDraft(conversationId, "");
  }

  function pickFile(file: File | undefined) {
    setMediaError(null);
    if (!file) return;
    const kind = kindForFile(file.type);
    if (!kind) {
      setMediaError("Only images, videos and audio files can be sent.");
      return;
    }
    const problem = checkFile(kind, file);
    if (problem) {
      setMediaError(problem);
      return;
    }
    setStaged({
      file,
      kind,
      previewUrl: kind === "IMAGE" || kind === "VIDEO" ? URL.createObjectURL(file) : null,
    });
  }

  async function sendMedia(media: Omit<MediaSend, "onProgress">) {
    setMediaError(null);
    setProgress(0);
    try {
      await onSendMedia({ ...media, replyToId: replyTo?.id, onProgress: setProgress });
      onCancelReply();
      return true;
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Could not send that file");
      return false;
    } finally {
      setProgress(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (staged) {
      const ok = await sendMedia({
        kind: staged.kind,
        file: staged.file,
        fileName: staged.file.name,
        caption: draft.trim(),
      });
      if (ok) {
        setStaged(null);
        clearDraft();
      }
      return;
    }

    if (!hasText) return;
    const content = draft.trim();
    const quoted = replyTo ? toQuote(replyTo) : null;
    boxRef.current?.focus();
    setSending(true);
    clearDraft();
    onCancelReply();
    try {
      await onSend(content, quoted);
    } finally {
      setSending(false);
    }
  }

  async function sendVoice() {
    const note = await recorder.finish();
    if (!note) {
      setMediaError("That recording was too short.");
      return;
    }
    await sendMedia({
      kind: "VOICE",
      file: note.blob,
      fileName: note.fileName,
      caption: "",
      durationMs: note.durationMs,
      waveform: note.waveform,
    });
  }

  const error = mediaError ?? recorder.error;

  return (
    <div className="relative border-t bg-chat-header">
      {replyTo && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="chat-quote min-w-0 flex-1 px-2 py-1">
            <p className="text-xs font-medium text-primary">
              {replyTo.senderType === "AGENT" ? names.agent : names.visitor}
            </p>
            <p className="truncate text-xs text-chat-meta">{quoteText(toQuote(replyTo))}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex size-8 items-center justify-center rounded-full text-chat-meta hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {staged && (
        <div className="flex items-center gap-3 border-b px-3 py-2">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-chat-panel">
            {staged.kind === "IMAGE" && staged.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={staged.previewUrl} alt="" className="size-full object-cover" />
            ) : staged.kind === "VIDEO" ? (
              <Film className="size-6 text-chat-meta" aria-hidden />
            ) : (
              <FileAudio className="size-6 text-chat-meta" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{staged.file.name}</p>
            <p className="text-xs text-chat-meta">
              {formatBytes(staged.file.size)} · {staged.kind.toLowerCase()}
              {progress !== null && ` · uploading ${Math.round(progress * 100)}%`}
            </p>
            {progress !== null && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-chat-panel">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStaged(null)}
            disabled={busy}
            aria-label="Remove attachment"
            className="flex size-8 items-center justify-center rounded-full text-chat-meta hover:bg-accent disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-center justify-between gap-2 px-4 pt-2 text-xs text-destructive"
        >
          {error}
          <button
            type="button"
            onClick={() => {
              setMediaError(null);
              recorder.clearError();
            }}
            aria-label="Dismiss"
            className="text-chat-meta hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {recorder.recording ? (
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Discard recording"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-5" />
          </button>
          <div
            className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-chat-panel px-4 py-1.5 text-sm"
            aria-live="polite"
          >
            <span
              className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive"
              aria-hidden
            />
            <span className="w-10 shrink-0 font-medium tabular-nums">
              {formatDuration(recorder.elapsedMs)}
            </span>
            <LiveWaveform levels={recorder.levels} count={LIVE_BARS} />
            <span className="sr-only">Recording voice message…</span>
          </div>
          <button
            type="button"
            onClick={() => void sendVoice()}
            aria-label="Send voice message"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="size-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2.5">
          <input
            ref={fileRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            data-emoji-toggle
            onClick={() => {
              setEmojiOpen((open) => !open);
              if (emojiOpen) boxRef.current?.focus();
            }}
            aria-label={emojiOpen ? "Close emoji" : "Emoji"}
            aria-expanded={emojiOpen}
            title="Emoji"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full transition hover:bg-accent",
              emojiOpen ? "text-primary" : "text-chat-meta hover:text-foreground",
            )}
          >
            <Smile className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!connected || busy}
            aria-label="Attach a photo, video or audio file"
            title={connected ? "Attach" : "Attachments need a connection"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-chat-meta transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Paperclip className="size-5" />
          </button>
          <textarea
            ref={boxRef}
            rows={1}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={() => onActivity()}
            onBlur={(event) => {
              caretRef.current = event.currentTarget.selectionStart;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && emojiOpen) setEmojiOpen(false);
              // Enter sends, Shift+Enter breaks the line. `isComposing` keeps an
              // IME's Enter — picking a character — from sending half a word.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit(event);
              }
            }}
            placeholder={
              staged
                ? "Add a caption…"
                : connected
                  ? "Type a reply..."
                  : "Offline - messages will send on reconnect"
            }
            aria-label={staged ? "Caption" : "Reply"}
            className="max-h-32 min-w-0 flex-1 resize-none rounded-lg border-0 bg-chat-panel px-4 py-2 text-sm placeholder:text-chat-meta focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          />
          {hasText || staged ? (
            <button
              type="submit"
              // Text may be sent offline (it is queued); media needs a connection.
              disabled={busy || (staged !== null && !connected)}
              aria-label="Send"
              // Keeps the caret in the box, so a touch keyboard stays up.
              onPointerDown={(event) => event.preventDefault()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void recorder.start()}
              disabled={!connected || busy}
              aria-label="Record a voice message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {progress !== null ? (
                <span className="text-[10px] font-semibold">{Math.round(progress * 100)}%</span>
              ) : (
                <Mic className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </form>
      )}

      {/* Floats above the composer, anchored to the button, like WhatsApp Web. */}
      {emojiOpen && (
        <div className="absolute bottom-full left-2 z-20 mb-2">
          <EmojiPicker
            onPick={(emoji) => {
              if (reactionTarget) {
                onReaction(reactionTarget, emoji);
                setEmojiOpen(false);
                return;
              }
              insertEmoji(emoji);
            }}
            onClose={() => {
              setEmojiOpen(false);
              onReactionCancel();
              boxRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
