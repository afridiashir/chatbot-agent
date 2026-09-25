import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  kindForFile,
  receiptStatus,
  type ReceiptStatus,
  type AttachmentKind,
  type Message,
} from "@repo/types";
import type { ChatNotice } from "../hooks/useChat.js";
import { LIVE_BARS, formatDuration, useVoiceRecorder } from "../hooks/useVoiceRecorder.js";
import { useSwipeReply } from "../hooks/useSwipeReply.js";
import { useLongPress } from "../hooks/useLongPress.js";
import { ReactionBar } from "./ReactionBar.js";
import { quoteText, toQuote } from "../lib/quote.js";
import {
  enableForegroundNotifications,
  enablePush,
  notificationsSupported,
  pushAsked,
  rememberAsked,
} from "../lib/push.js";
import { formatClock, formatDayLabel, isNewDay } from "../lib/format.js";
import { isJumboEmoji } from "../lib/emoji.js";
import { checkVisitorFile } from "../lib/media.js";
import { copyText } from "../lib/clipboard.js";
import { EmojiPicker } from "./EmojiPicker.js";
import { MediaViewer, type ViewedMedia } from "./MediaViewer.js";
import { MessageMedia } from "./MessageMedia.js";
import { MessageText } from "./MessageText.js";
import { LiveWaveform } from "./Waveform.js";

/**
 * The agent id in one of our own chat links, or null for any other address.
 *
 * Matched on the shape rather than the host: the widget is embedded on other
 * people's sites and reached through several names — localhost in development,
 * the hosted page in production — and what identifies the link is that it is a
 * chat page naming an agent.
 */
function ourAgentLink(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    if (!url.pathname.endsWith("/chat")) return null;
    const agentId = url.searchParams.get("agent");
    return agentId && /^[A-Za-z0-9_-]{1,64}$/.test(agentId) ? agentId : null;
  } catch {
    return null;
  }
}

export interface VisitorMediaSend {
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

interface ChatPanelProps {
  apiUrl: string;
  agentName: string;
  /** False when the agent is away: the chat still works, they reply later. */
  agentOnline: boolean;
  /** The agent's profile photo path, or null for the default silhouette. */
  agentPhoto: string | null;
  messages: Message[];
  /** "Connected with ..." lines, drawn in among the messages. */
  notices: ChatNotice[];
  connected: boolean;
  isClosed: boolean;
  agentTyping: boolean;
  error: string | null;
  onSend: (content: string, replyToId?: string) => Promise<void>;
  /** True on the hosted chat page, where notifications are possible. */
  canPush: boolean;
  /** This browser's visitor id, which a push subscription is filed under. */
  visitorId: string;
  /** Adds, replaces or removes this visitor's reaction; null takes it back. */
  onReact: (messageId: string, emoji: string | null) => void;
  /** Uploads and sends a file or voice note; rejects with a readable error. */
  onSendMedia: (media: VisitorMediaSend) => Promise<void>;
  onTyping: () => void;
  onStartOver: () => void;
  /** Opens a colleague's chat in place, when one is shared into this one. */
  onOpenAgent?: (agentId: string) => void;
}

/** Three dots, animated with a staggered delay so they ripple. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-2 w-2 animate-bounce rounded-full bg-wa-meta/70"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

const TICK =
  "M11.07.65 5.26 7.74 2.87 5.4a.5.5 0 0 0-.7.72l2.78 2.7a.5.5 0 0 0 .73-.04l6.16-7.5a.5.5 0 0 0-.77-.63z";

/**
 * WhatsApp's ticks: one grey once stored, two grey once the agent's inbox has
 * it, two blue once the agent has the chat open.
 */
function Ticks({ status }: { status: ReceiptStatus }) {
  if (status === "SENT") {
    return (
      <svg
        viewBox="0 0 12 11"
        className="h-[11px] w-3 text-wa-meta"
        fill="currentColor"
        aria-label="Sent"
      >
        <path d={TICK} />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 11"
      className={`h-[11px] w-4 ${status === "READ" ? "text-wa-blue" : "text-wa-meta"}`}
      fill="currentColor"
      aria-label={status === "READ" ? "Seen" : "Delivered"}
    >
      <path d={TICK} />
      <path d="M15.07.65 9.26 7.74l-.9-.88-.69.84 1.28 1.24a.5.5 0 0 0 .73-.04l6.16-7.5a.5.5 0 0 0-.77-.63z" />
    </svg>
  );
}

function Stamp({ message, outgoing }: { message: Message; outgoing: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap text-wa-meta">
      {formatClock(message.createdAt)}
      {outgoing && <Ticks status={receiptStatus(message)} />}
    </span>
  );
}

function MessageBubble({
  apiUrl,
  message,
  agent,
  continued,
  canReply,
  flash,
  reacting,
  onView,
  onReply,
  onReact,
  onOpenReactions,
  onCloseReactions,
  onMoreEmoji,
  onJumpTo,
  registerRef,
}: {
  apiUrl: string;
  message: Message;
  agent: { name: string; photo: string | null };
  /** Follows a message from the same side, so it drops the tail. */
  continued: boolean;
  /** False once the chat is closed or the connection is down. */
  canReply: boolean;
  /** Briefly highlighted because a reply's quote pointed here. */
  flash: boolean;
  /** The reaction bar is open on this message. */
  reacting: boolean;
  onView: (media: ViewedMedia) => void;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string | null) => void;
  onOpenReactions: (messageId: string) => void;
  onCloseReactions: () => void;
  onMoreEmoji: (messageId: string) => void;
  onJumpTo: (messageId: string) => void;
  registerRef: (messageId: string, element: HTMLDivElement | null) => void;
}) {
  const outgoing = message.senderType === "VISITOR";
  const media = message.attachment;
  const bareVoice = media?.kind === "VOICE" && !message.content;
  const jumbo = !media && isJumboEmoji(message.content);
  const swipe = useSwipeReply(canReply, () => onReply(message));
  // Touch screens hold the message down; a pointer hovers it instead.
  const longPress = useLongPress(() => canReply && onOpenReactions(message.id));
  /** Says so briefly, because a copy that says nothing looks like a miss. */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const mine = message.reactions.find((r) => r.senderType === "VISITOR")?.emoji ?? null;

  return (
    <div
      ref={(element) => registerRef(message.id, element)}
      className={`wa-hold group relative flex items-center gap-1 ${
        outgoing ? "justify-end" : "justify-start"
      } ${continued ? "mt-0.5" : "mt-2"} ${flash ? "wa-flash" : ""}`}
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
      onContextMenu={(event) => {
        // Only on touch, and only where a long press opens our own menu in its
        // place: a right-click with a mouse still offers copy, and a chat that
        // has ended keeps the phone's own menu rather than losing both.
        if (canReply && window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
      }}
    >
      {reacting && (
        <div className={`absolute bottom-full z-20 mb-1 ${outgoing ? "right-0" : "left-0"}`}>
          <ReactionBar
            mine={mine}
            onPick={(emoji) => {
              onReact(message.id, emoji);
              onCloseReactions();
            }}
            onMore={() => onMoreEmoji(message.id)}
            onClose={onCloseReactions}
            onCopy={
              message.content
                ? () => {
                    void copyText(message.content).then((ok) => {
                      setCopied(ok);
                      onCloseReactions();
                    });
                  }
                : undefined
            }
          />
        </div>
      )}

      {copied && (
        <span
          role="status"
          className="absolute -top-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-wa-text/85 px-2 py-0.5 text-[11px] font-medium text-white"
        >
          Copied
        </span>
      )}

      {/* Appears from under the bubble as it is dragged aside. */}
      {swipe.swiping && (
        <span
          aria-hidden
          className="absolute top-1/2 left-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/10 text-wa-icon"
          style={{ opacity: Math.min(1, swipe.offset / 46) }}
        >
          <ReplyIcon />
        </span>
      )}

      {/* Beside the bubble on its outer side, so it stays next to a short
          message instead of drifting to the edge of the panel. Pointer devices
          only: on a touch screen the swipe does this job. */}
      {canReply && outgoing && (
        <>
          <ReactButton onClick={() => onOpenReactions(message.id)} />
          <ReplyButton onClick={() => onReply(message)} />
        </>
      )}

      <div
        className={[
          "max-w-[82%] text-sm",
          outgoing ? "wa-bubble-out" : "wa-bubble-in",
          continued ? "wa-cont" : "",
          media ? "p-1" : "px-2 pt-1.5 pb-1",
        ].join(" ")}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo(message.replyTo!.id)}
            className={`wa-quote mb-1 block w-full px-2 py-1 text-left ${media ? "mx-0.5 mt-0.5 w-auto" : ""}`}
          >
            <span className="block text-xs font-medium text-wa-teal">
              {message.replyTo.senderType === "VISITOR" ? "You" : agent.name}
            </span>
            <span className="block truncate text-xs text-wa-meta">
              {quoteText(message.replyTo)}
            </span>
          </button>
        )}
        {media && (
          <MessageMedia
            apiUrl={apiUrl}
            attachment={media}
            outgoing={outgoing}
            agent={agent}
            footer={bareVoice ? <Stamp message={message} outgoing={outgoing} /> : undefined}
            onOpen={() =>
              onView({
                attachment: media,
                sender: outgoing ? "You" : agent.name,
                caption: message.content || null,
                createdAt: message.createdAt,
              })
            }
          />
        )}
        {message.content && (
          <p
            className={`break-words whitespace-pre-wrap ${media ? "px-1.5 pt-1" : "px-1"} ${
              jumbo ? "emoji pb-1 text-[2.5rem] leading-[1.2]" : ""
            }`}
          >
            <MessageText content={message.content} />
            {/* An invisible spacer the width of the stamp, so the last line never runs under it. */}
            <span className="invisible ml-2 inline-block w-14" aria-hidden="true" />
          </p>
        )}
        {!bareVoice && (
          <div className={`flex justify-end pr-1 ${message.content ? "-mt-3.5" : "mt-1 pb-0.5"}`}>
            <Stamp message={message} outgoing={outgoing} />
          </div>
        )}

        {message.reactions.length > 0 && (
          <button
            type="button"
            onClick={() => (mine ? onReact(message.id, null) : onOpenReactions(message.id))}
            aria-label={mine ? "Remove your reaction" : "React to this message"}
            title={mine ? "Tap to remove your reaction" : "React"}
            className="relative z-10 -mb-3 ml-1 flex translate-y-1 items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[13px] leading-none opacity-100 shadow-[0_1px_2px_rgb(11_20_26/0.2)]"
          >
            {message.reactions.map((reaction) => (
              <span key={reaction.senderType} className="emoji">
                {reaction.emoji}
              </span>
            ))}
          </button>
        )}
      </div>

      {canReply && !outgoing && (
        <>
          <ReplyButton onClick={() => onReply(message)} />
          <ReactButton onClick={() => onOpenReactions(message.id)} />
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
      className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-wa-icon opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" strokeLinecap="round" />
      </svg>
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
      className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-wa-icon opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
    >
      <ReplyIcon />
    </button>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
    </svg>
  );
}

const roundButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-green text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const iconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-wa-icon transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";

export function ChatPanel({
  apiUrl,
  agentName,
  agentOnline,
  agentPhoto,
  messages,
  notices,
  connected,
  isClosed,
  agentTyping,
  error: chatError,
  canPush,
  visitorId,
  onSend,
  onReact,
  onSendMedia,
  onTyping,
  onStartOver,
  onOpenAgent,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [staged, setStaged] = useState<{
    file: File;
    kind: Exclude<AttachmentKind, "VOICE">;
  } | null>(null);
  /**
   * The file on its way to storage, if any. Deliberately not the staged one:
   * sending hands the file to this and empties the composer, so the next
   * message can be typed while the upload runs.
   */
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewedMedia | null>(null);
  /** The message being replied to, shown above the box until sent or dropped. */
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  /** Briefly highlighted after jumping to it from a quote. */
  const [flashId, setFlashId] = useState<string | null>(null);
  /** The message whose reaction bar is open, if any. */
  const [reactingId, setReactingId] = useState<string | null>(null);
  /** Set while the emoji panel is picking a reaction rather than typing. */
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  /** The offer to notify them of replies, once they have said something. */
  const [offerPush, setOfferPush] = useState(false);
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());
  const closeViewer = useCallback(() => setViewing(null), []);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Where an emoji goes: the caret, remembered while the picker has focus. */
  const caretRef = useRef<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Touch screens swap the panel and the keyboard, as WhatsApp does; with a
  // mouse both stay up and the caret never leaves the message box.
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const recorder = useVoiceRecorder();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, agentTyping]);

  // One line until the text needs more, then taller up to the CSS max height.
  // Only a change of height is followed: scrolling on every keystroke would
  // drag someone out of the history they were reading.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    const before = box.offsetHeight;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
    if (box.offsetHeight !== before) endRef.current?.scrollIntoView({ block: "end" });
  }, [draft]);

  // Starting a reply, or tapping into the box, returns to the newest messages:
  // the visitor is about to write, and what they answer belongs in view.
  useEffect(() => {
    if (replyTo) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [replyTo]);

  // Asked only once they have written something: a stranger who has not
  // spoken yet is not asked for permission to notify them.
  const said = messages.some((message) => message.senderType === "VISITOR");
  useEffect(() => {
    if (!notificationsSupported() || !said || pushAsked()) return;
    if (Notification.permission !== "default") return;
    const timer = setTimeout(() => setOfferPush(true), 1500);
    return () => clearTimeout(timer);
  }, [said]);

  // Only the text send blocks the box, and that is a moment. An upload runs
  // behind the composer rather than in front of it.
  const busy = sending;

  /*
   * Messages and notices as one list, in the order they happened.
   *
   * The day separator and the grouping of one sender's messages are worked out
   * here rather than in the loop, because a notice sits between messages and
   * has to break a group: two messages from the same person either side of
   * "connected with ..." are not one run of speech.
   */
  const stream = useMemo(() => {
    const items: Array<
      | { kind: "message"; at: string; message: Message; newDay: boolean; continued: boolean }
      | { kind: "notice"; at: string; notice: ChatNotice }
    > = [
      ...messages.map((message) => ({
        kind: "message" as const,
        at: message.createdAt,
        message,
        newDay: false,
        continued: false,
      })),
      ...notices.map((notice) => ({ kind: "notice" as const, at: notice.at, notice })),
    ];
    // A stable sort, with the messages laid down first, puts a notice recorded
    // in the same moment as a message after it rather than before.
    items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    let previous: Message | undefined;
    for (const item of items) {
      if (item.kind === "notice") {
        previous = undefined;
        continue;
      }
      item.newDay = isNewDay(item.message.createdAt, previous?.createdAt);
      item.continued = !item.newDay && previous?.senderType === item.message.senderType;
      previous = item.message;
    }
    return items;
  }, [messages, notices]);
  const hasText = draft.trim().length > 0;
  const canSend = connected && !isClosed && !busy && (hasText || staged !== null);
  const agent = { name: agentName, photo: agentPhoto };

  const registerRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) bubbleRefs.current.set(messageId, element);
    else bubbleRefs.current.delete(messageId);
  }, []);

  const startReply = useCallback((message: Message) => {
    setReplyTo(message);
    setReactingId(null);
    inputRef.current?.focus();
  }, []);

  const closeReactions = useCallback(() => setReactingId(null), []);

  /** "+" on the bar: the full emoji panel picks the reaction instead. */
  const moreEmoji = useCallback((messageId: string) => {
    setReactingId(null);
    setReactionTarget(messageId);
    setEmojiOpen(true);
  }, []);

  // A tap anywhere else closes the reaction bar, as a popup should.
  useEffect(() => {
    if (!reactingId) return;
    const close = (event: Event) => {
      // Inside a shadow root `event.target` is retargeted to the host, so the
      // bar is found along the composed path instead. A press on the bar is a
      // reaction being picked, not a dismissal.
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

  /** Tapping a quote scrolls to the original and flashes it. */
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

  function pickFile(file: File | undefined) {
    setMediaError(null);
    if (!file) return;
    const kind = kindForFile(file.type);
    const problem = kind
      ? checkVisitorFile(kind, file)
      : "Only photos, videos and audio can be sent.";
    if (problem || !kind) {
      setMediaError(problem);
      return;
    }
    setStaged({ file, kind });
  }

  /**
   * Starts an upload and returns: the file goes on its own while the visitor
   * carries on typing. One at a time, so the attach and record buttons wait
   * their turn, but an ordinary message never does.
   *
   * A failure names the file, because by then it has left the screen.
   */
  function startUpload(
    media: Omit<VisitorMediaSend, "onProgress" | "replyToId">,
    name: string,
  ): void {
    setMediaError(null);
    setUploading({ name, progress: 0 });
    const quoted = replyTo?.id;
    setReplyTo(null);

    void onSendMedia({
      ...media,
      replyToId: quoted,
      onProgress: (fraction) =>
        setUploading((current) => (current ? { ...current, progress: fraction } : current)),
    })
      .catch((error: unknown) =>
        setMediaError(`${name}: ${error instanceof Error ? error.message : "could not be sent"}`),
      )
      .finally(() => setUploading(null));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    if (staged) {
      // Cleared first, so the box is free the instant send is pressed.
      startUpload(
        {
          kind: staged.kind,
          file: staged.file,
          fileName: staged.file.name,
          caption: draft.trim(),
        },
        staged.file.name,
      );
      setStaged(null);
      setDraft("");
      inputRef.current?.focus();
      return;
    }

    const content = draft.trim();
    const quoted = replyTo;
    // The keyboard stays up for the next message rather than closing on send.
    inputRef.current?.focus();
    setSending(true);
    // Cleared up front so the input feels responsive; the message itself is
    // rendered only once the server has stored and broadcast it.
    setDraft("");
    setReplyTo(null);
    try {
      await onSend(content, quoted?.id);
    } finally {
      setSending(false);
    }
  }

  function pickEmoji(emoji: string) {
    if (reactionTarget) {
      onReact(reactionTarget, emoji);
      setReactionTarget(null);
      setEmojiOpen(false);
      return;
    }
    insertEmoji(emoji);
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    // With a mouse the box keeps focus, so its live selection is the truth
    // (React's onSelect never fires inside a shadow root). Otherwise use the
    // caret saved when it lost focus.
    const focused =
      input !== null && (input.getRootNode() as ShadowRoot | Document).activeElement === input;
    const start = Math.min(
      (focused ? input.selectionStart : caretRef.current) ?? draft.length,
      draft.length,
    );
    const end = Math.max(
      start,
      Math.min((focused ? input.selectionEnd : null) ?? start, draft.length),
    );
    const caret = start + emoji.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    caretRef.current = caret;
    onTyping();
    if (!touch) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(caret, caret);
      });
    }
  }

  function toggleEmoji() {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
      return;
    }
    setEmojiOpen(true);
    // Drop the keyboard so the panel takes its place.
    if (touch) inputRef.current?.blur();
  }

  async function sendVoice() {
    const note = await recorder.finish();
    if (!note) {
      setMediaError("That recording was too short.");
      return;
    }
    startUpload(
      {
        kind: "VOICE",
        file: note.blob,
        fileName: note.fileName,
        caption: "",
        durationMs: note.durationMs,
        waveform: note.waveform,
      },
      "Voice message",
    );
  }

  const error = mediaError ?? recorder.error ?? chatError;

  const previewing = staged !== null && staged.kind !== "AUDIO";

  return (
    <>
      {viewing && <MediaViewer apiUrl={apiUrl} media={viewing} onClose={closeViewer} />}

      {staged && staged.kind !== "AUDIO" && (
        <StagedPreview
          file={staged.file}
          kind={staged.kind}
          progress={null}
          busy={false}
          onRemove={() => setStaged(null)}
        />
      )}

      <div
        /*
         * An agent sharing a colleague sends their chat link. Opening it in a
         * new tab would take the visitor out of the conversation they are in
         * and make them identify themselves again, when the widget can simply
         * open that chat here — it already holds more than one.
         *
         * One handler on the list rather than a prop threaded down to every
         * bubble: the link is an ordinary anchor drawn by `MessageText`, and
         * this only has to notice it was ours.
         */
        onClickCapture={(event) => {
          if (!onOpenAgent) return;
          const anchor = (event.target as HTMLElement).closest?.("a");
          const href = anchor?.getAttribute("href");
          const agentId = href ? ourAgentLink(href) : null;
          if (!agentId) return;
          event.preventDefault();
          onOpenAgent(agentId);
        }}
        className={`wa-canvas flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-2 ${previewing ? "hidden" : "flex"}`}
      >
        {messages.length === 0 && (
          <div className="mx-auto my-3 max-w-[85%] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-xs text-wa-text shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
            {agentOnline
              ? `You're chatting with ${agentName}. Say hello to get started.`
              : `${agentName} is away right now. Leave a message and they'll reply here when they're back.`}
          </div>
        )}
        {stream.map((item) => {
          if (item.kind === "notice") {
            return (
              <div key={item.notice.id} className="my-2 flex justify-center">
                <span className="max-w-[85%] rounded-lg bg-white px-3 py-1 text-center text-[12px] text-wa-meta shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                  Connected with {item.notice.agentName}
                </span>
              </div>
            );
          }
          const { message, newDay, continued } = item;
          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-lg bg-white px-3 py-1 text-[12px] text-wa-meta shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                apiUrl={apiUrl}
                message={message}
                agent={agent}
                continued={continued}
                canReply={!isClosed && connected}
                flash={flashId === message.id}
                reacting={reactingId === message.id}
                onView={setViewing}
                onReply={startReply}
                onReact={onReact}
                onOpenReactions={setReactingId}
                onCloseReactions={closeReactions}
                onMoreEmoji={moreEmoji}
                onJumpTo={jumpTo}
                registerRef={registerRef}
              />
            </div>
          );
        })}
        {agentTyping && (
          <div className="mt-2 flex justify-start" aria-live="polite">
            <div className="wa-bubble-in flex items-center px-4 py-3">
              <TypingDots />
              <span className="sr-only">{agentName} is typing</span>
            </div>
          </div>
        )}
        <div ref={endRef} className="h-1" />
      </div>

      {isClosed ? (
        <div className="flex flex-col items-center gap-2 bg-wa-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center">
          <p className="text-sm text-wa-meta">This conversation has ended.</p>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-full bg-wa-green px-5 py-2 text-sm font-medium text-white transition hover:brightness-95"
          >
            Start a new chat
          </button>
        </div>
      ) : (
        // Clears the iPhone home indicator when full screen.
        <div className="bg-wa-panel pb-[env(safe-area-inset-bottom)]">
          {offerPush && (
            <div className="flex items-center gap-2 border-b border-wa-divider bg-white px-3 py-2">
              <p className="min-w-0 flex-1 text-xs text-wa-text">
                Get a notification when we reply?
              </p>
              <button
                type="button"
                onClick={() => {
                  rememberAsked();
                  setOfferPush(false);
                  // Our own page can be pushed to with the tab closed; on a
                  // client's site permission alone is all a browser allows.
                  void (canPush ? enablePush(apiUrl, visitorId) : enableForegroundNotifications());
                }}
                className="rounded-full bg-wa-green px-3 py-1 text-xs font-medium text-white transition hover:brightness-95"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  rememberAsked();
                  setOfferPush(false);
                }}
                className="rounded-full px-2 py-1 text-xs text-wa-meta transition hover:bg-black/5"
              >
                No thanks
              </button>
            </div>
          )}
          {replyTo && (
            <div className="flex items-center gap-2 border-b border-wa-divider bg-white px-3 py-2">
              <div className="wa-quote min-w-0 flex-1 px-2 py-1">
                <p className="text-xs font-medium text-wa-teal">
                  {replyTo.senderType === "VISITOR" ? "You" : agentName}
                </p>
                <p className="truncate text-xs text-wa-meta">{quoteText(toQuote(replyTo))}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className={iconButton}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          {staged && !previewing && (
            <div className="flex items-center gap-2 border-b border-wa-divider bg-white px-3 py-2">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-wa-panel text-lg"
                aria-hidden="true"
              >
                🎵
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-wa-text">{staged.file.name}</p>
                <p className="text-[11px] text-wa-meta">{formatBytes(staged.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setStaged(null)}
                disabled={busy}
                aria-label="Remove attachment"
                className={iconButton}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}

          {uploading && (
            <div className="flex items-center gap-2 px-4 pt-2 text-[11px] text-wa-meta">
              <span className="truncate">
                Sending {uploading.name} · {Math.round(uploading.progress * 100)}%
              </span>
              <span className="h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-wa-panel">
                <span
                  className="block h-full rounded-full bg-wa-green transition-[width]"
                  style={{ width: `${Math.round(uploading.progress * 100)}%` }}
                />
              </span>
            </div>
          )}
          {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}

          {recorder.recording ? (
            <div className="flex items-center gap-2 px-2 py-2">
              <button
                type="button"
                onClick={recorder.cancel}
                aria-label="Discard recording"
                className={iconButton.replace("text-wa-icon", "text-red-500")}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                  />
                </svg>
              </button>
              <div
                className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-2"
                aria-live="polite"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500"
                  aria-hidden="true"
                />
                <span className="w-9 shrink-0 text-sm tabular-nums text-wa-text">
                  {formatDuration(recorder.elapsedMs)}
                </span>
                <LiveWaveform levels={recorder.levels} count={Math.round(LIVE_BARS * 0.7)} />
                <span className="sr-only">Recording…</span>
              </div>
              <button
                type="button"
                onClick={() => void sendVoice()}
                aria-label="Send voice message"
                className={roundButton}
              >
                <SendIcon />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex items-end gap-2 px-2 py-2">
              <input
                ref={fileRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  pickFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {/* WhatsApp's pill: emoji left of the text, attach on the right. */}
              <div className="flex min-w-0 flex-1 items-center rounded-full bg-white px-1 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleEmoji}
                  disabled={!connected}
                  aria-label={emojiOpen ? (touch ? "Show keyboard" : "Close emoji") : "Emoji"}
                  aria-expanded={emojiOpen}
                  className={
                    emojiOpen && !touch
                      ? iconButton.replace("text-wa-icon", "text-wa-green")
                      : iconButton
                  }
                >
                  {emojiOpen && touch ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="2.5" y="6" width="19" height="12" rx="2" />
                      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[22px] w-[22px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8.5 14s1.3 2 3.5 2 3.5-2 3.5-2" />
                      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" />
                    </svg>
                  )}
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    caretRef.current = event.target.selectionStart;
                    onTyping();
                  }}
                  onBlur={(event) => {
                    caretRef.current = event.currentTarget.selectionStart;
                  }}
                  onFocus={() => {
                    if (touch) setEmojiOpen(false);
                    endRef.current?.scrollIntoView({ block: "end" });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && emojiOpen) setEmojiOpen(false);
                    // Enter sends and Shift+Enter breaks the line, as on a desktop
                    // chat app. On a touch keyboard Enter is the line break: the
                    // send button is right there. `isComposing` keeps an IME's
                    // Enter — picking a character — from sending half a word.
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !touch &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void submit(event);
                    }
                  }}
                  placeholder={
                    !connected ? "Reconnecting…" : staged ? "Add a caption…" : "Type a message"
                  }
                  disabled={!connected}
                  aria-label={staged ? "Caption" : "Message"}
                  className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base text-wa-text placeholder:text-wa-meta sm:text-[15px] focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!connected || busy}
                  aria-label="Attach a photo, video or audio file"
                  className={iconButton}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 -rotate-45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"
                    />
                  </svg>
                </button>
              </div>
              {hasText || staged ? (
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  // Keeps the caret — and so the on-screen keyboard — where it
                  // is: without this the button takes focus and the keyboard
                  // drops between every message.
                  onPointerDown={(event) => event.preventDefault()}
                  className={roundButton}
                >
                  <SendIcon />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen(false);
                    void recorder.start();
                  }}
                  disabled={!connected || uploading !== null}
                  aria-label="Record a voice message"
                  className={roundButton}
                >
                  {uploading ? (
                    <span className="text-[11px] font-semibold">
                      {Math.round(uploading.progress * 100)}%
                    </span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a.9.9 0 1 0-1.8 0 4.2 4.2 0 0 1-8.4 0 .9.9 0 1 0-1.8 0 6 6 0 0 0 5.1 5.9V20H9a.9.9 0 1 0 0 1.8h6a.9.9 0 1 0 0-1.8h-2.1v-2.6a6 6 0 0 0 5.1-5.9z" />
                    </svg>
                  )}
                </button>
              )}
            </form>
          )}

          {emojiOpen && !recorder.recording && (
            <EmojiPicker
              onPick={pickEmoji}
              onClose={() => {
                setEmojiOpen(false);
                setReactionTarget(null);
                inputRef.current?.focus();
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

/**
 * WhatsApp's send preview: the picked photo or video large on a dark
 * background, with the composer underneath taking the caption.
 */
function StagedPreview({
  file,
  kind,
  progress,
  busy,
  onRemove,
}: {
  file: File;
  kind: "IMAGE" | "VIDEO";
  progress: number | null;
  busy: boolean;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0b141a] text-white">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label="Remove attachment"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 disabled:opacity-40"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-[11px] text-white/60">
            {formatBytes(file.size)}
            {progress !== null && ` · uploading ${Math.round(progress * 100)}%`}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
        {url &&
          (kind === "VIDEO" ? (
            <video
              src={url}
              controls
              playsInline
              aria-label={`Preview of ${file.name}`}
              className="max-h-full max-w-full rounded bg-black"
            />
          ) : (
            <img
              src={url}
              alt={`Preview of ${file.name}`}
              className="max-h-full max-w-full rounded object-contain"
            />
          ))}
      </div>

      {progress !== null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <div
            className="h-full bg-wa-green transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4 21.3 12 3.4 3.6 3.4 10l12.8 2-12.8 2z" />
    </svg>
  );
}
