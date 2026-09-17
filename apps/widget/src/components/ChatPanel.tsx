import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  kindForFile,
  receiptStatus,
  type ReceiptStatus,
  type AttachmentKind,
  type Message,
} from "@repo/types";
import { LIVE_BARS, formatDuration, useVoiceRecorder } from "../hooks/useVoiceRecorder.js";
import { formatClock, formatDayLabel, isNewDay } from "../lib/format.js";
import { isJumboEmoji } from "../lib/emoji.js";
import { checkVisitorFile } from "../lib/media.js";
import { EmojiPicker } from "./EmojiPicker.js";
import { MediaViewer, type ViewedMedia } from "./MediaViewer.js";
import { MessageMedia } from "./MessageMedia.js";
import { LiveWaveform } from "./Waveform.js";

export interface VisitorMediaSend {
  kind: AttachmentKind;
  file: Blob;
  fileName: string;
  caption: string;
  durationMs?: number;
  waveform?: number[];
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
  connected: boolean;
  isClosed: boolean;
  agentTyping: boolean;
  error: string | null;
  onSend: (content: string) => Promise<void>;
  /** Uploads and sends a file or voice note; rejects with a readable error. */
  onSendMedia: (media: VisitorMediaSend) => Promise<void>;
  onTyping: () => void;
  onStartOver: () => void;
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

const TICK = "M11.07.65 5.26 7.74 2.87 5.4a.5.5 0 0 0-.7.72l2.78 2.7a.5.5 0 0 0 .73-.04l6.16-7.5a.5.5 0 0 0-.77-.63z";

/**
 * WhatsApp's ticks: one grey once stored, two grey once the agent's inbox has
 * it, two blue once the agent has the chat open.
 */
function Ticks({ status }: { status: ReceiptStatus }) {
  if (status === "SENT") {
    return (
      <svg viewBox="0 0 12 11" className="h-[11px] w-3 text-wa-meta" fill="currentColor" aria-label="Sent">
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
  onView,
}: {
  apiUrl: string;
  message: Message;
  agent: { name: string; photo: string | null };
  /** Follows a message from the same side, so it drops the tail. */
  continued: boolean;
  onView: (media: ViewedMedia) => void;
}) {
  const outgoing = message.senderType === "VISITOR";
  const media = message.attachment;
  const bareVoice = media?.kind === "VOICE" && !message.content;
  const jumbo = !media && isJumboEmoji(message.content);

  return (
    <div
      className={`flex ${outgoing ? "justify-end" : "justify-start"} ${continued ? "mt-0.5" : "mt-2"}`}
    >
      <div
        className={[
          "max-w-[82%] text-sm",
          outgoing ? "wa-bubble-out" : "wa-bubble-in",
          continued ? "wa-cont" : "",
          media ? "p-1" : "px-2 pt-1.5 pb-1",
        ].join(" ")}
      >
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
            {message.content}
            {/* An invisible spacer the width of the stamp, so the last line never runs under it. */}
            <span className="invisible ml-2 inline-block w-14" aria-hidden="true" />
          </p>
        )}
        {!bareVoice && (
          <div className={`flex justify-end pr-1 ${message.content ? "-mt-3.5" : "mt-1 pb-0.5"}`}>
            <Stamp message={message} outgoing={outgoing} />
          </div>
        )}
      </div>
    </div>
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
  connected,
  isClosed,
  agentTyping,
  error: chatError,
  onSend,
  onSendMedia,
  onTyping,
  onStartOver,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [staged, setStaged] = useState<{
    file: File;
    kind: Exclude<AttachmentKind, "VOICE">;
  } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewedMedia | null>(null);
  const closeViewer = useCallback(() => setViewing(null), []);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const busy = sending || progress !== null;
  const hasText = draft.trim().length > 0;
  const canSend = connected && !isClosed && !busy && (hasText || staged !== null);
  const agent = { name: agentName, photo: agentPhoto };

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

  async function sendMedia(media: Omit<VisitorMediaSend, "onProgress">) {
    setMediaError(null);
    setProgress(0);
    try {
      await onSendMedia({ ...media, onProgress: setProgress });
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
    if (!canSend) return;

    if (staged) {
      const ok = await sendMedia({
        kind: staged.kind,
        file: staged.file,
        fileName: staged.file.name,
        caption: draft.trim(),
      });
      if (ok) {
        setStaged(null);
        setDraft("");
      }
      return;
    }

    const content = draft.trim();
    setSending(true);
    // Cleared up front so the input feels responsive; the message itself is
    // rendered only once the server has stored and broadcast it.
    setDraft("");
    try {
      await onSend(content);
    } finally {
      setSending(false);
    }
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    // With a mouse the box keeps focus, so its live selection is the truth
    // (React's onSelect never fires inside a shadow root). Otherwise use the
    // caret saved when it lost focus.
    const focused = input !== null && (input.getRootNode() as ShadowRoot | Document).activeElement === input;
    const start = Math.min((focused ? input.selectionStart : caretRef.current) ?? draft.length, draft.length);
    const end = Math.max(start, Math.min((focused ? input.selectionEnd : null) ?? start, draft.length));
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
    await sendMedia({
      kind: "VOICE",
      file: note.blob,
      fileName: note.fileName,
      caption: "",
      durationMs: note.durationMs,
      waveform: note.waveform,
    });
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
          progress={progress}
          busy={busy}
          onRemove={() => setStaged(null)}
        />
      )}

      <div
        className={`wa-canvas flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-2 ${previewing ? "hidden" : "flex"}`}
      >
        {messages.length === 0 && (
          <div className="mx-auto my-3 max-w-[85%] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-xs text-wa-text shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
            {agentOnline
              ? `You're chatting with ${agentName}. Say hello to get started.`
              : `${agentName} is away right now. Leave a message and they'll reply here when they're back.`}
          </div>
        )}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = isNewDay(message.createdAt, previous?.createdAt);
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
                continued={!newDay && previous?.senderType === message.senderType}
                onView={setViewing}
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
                <p className="text-[11px] text-wa-meta">
                  {formatBytes(staged.file.size)}
                  {progress !== null && ` · uploading ${Math.round(progress * 100)}%`}
                </p>
                {progress !== null && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-wa-panel">
                    <div
                      className="h-full rounded-full bg-wa-green transition-[width]"
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
                    emojiOpen && !touch ? iconButton.replace("text-wa-icon", "text-wa-green") : iconButton
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
                <input
                  ref={inputRef}
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
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && emojiOpen) setEmojiOpen(false);
                  }}
                  placeholder={
                    !connected ? "Reconnecting…" : staged ? "Add a caption…" : "Type a message"
                  }
                  disabled={!connected}
                  aria-label={staged ? "Caption" : "Message"}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-wa-text placeholder:text-wa-meta sm:text-[15px] focus:outline-none disabled:opacity-60"
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
                  className={roundButton}
                >
                  {progress !== null ? (
                    <span className="text-[11px] font-semibold">{Math.round(progress * 100)}%</span>
                  ) : (
                    <SendIcon />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen(false);
                    void recorder.start();
                  }}
                  disabled={!connected || busy}
                  aria-label="Record a voice message"
                  className={roundButton}
                >
                  {progress !== null ? (
                    <span className="text-[11px] font-semibold">{Math.round(progress * 100)}%</span>
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
              onPick={insertEmoji}
              onClose={() => {
                setEmojiOpen(false);
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
