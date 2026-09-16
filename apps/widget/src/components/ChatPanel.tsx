import { useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  kindForFile,
  type AttachmentKind,
  type Message,
} from "@repo/types";
import { LIVE_BARS, formatDuration, useVoiceRecorder } from "../hooks/useVoiceRecorder.js";
import { LiveWaveform } from "./Waveform.js";
import { checkVisitorFile } from "../lib/media.js";
import { AgentAvatar } from "./AgentAvatar.js";
import { MessageMedia } from "./MessageMedia.js";

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
  /** The agent's profile photo path, or null for initials. */
  agentPhoto: string | null;
  agentOnline: boolean;
  messages: Message[];
  connected: boolean;
  isClosed: boolean;
  agentTyping: boolean;
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
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function MessageBubble({
  apiUrl,
  message,
  agent,
  showAgentPhoto,
}: {
  apiUrl: string;
  message: Message;
  agent: { name: string; photo: string | null };
  showAgentPhoto: boolean;
}) {
  const fromVisitor = message.senderType === "VISITOR";
  const media = message.attachment;

  return (
    <div className={fromVisitor ? "flex justify-end" : "flex items-end justify-start gap-2"}>
      {!fromVisitor &&
        (showAgentPhoto ? (
          <AgentAvatar apiUrl={apiUrl} name={agent.name} photo={agent.photo} size={24} />
        ) : (
          <span className="w-6 shrink-0" aria-hidden="true" />
        ))}
      <div
        className={[
          "max-w-[80%] rounded-2xl text-sm whitespace-pre-wrap break-words",
          media ? "p-1" : "px-3 py-2",
          fromVisitor ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800",
        ].join(" ")}
      >
        {media && <MessageMedia apiUrl={apiUrl} attachment={media} fromVisitor={fromVisitor} />}
        {message.content && <p className={media ? "px-2 pt-1 pb-1" : ""}>{message.content}</p>}
      </div>
    </div>
  );
}

const iconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40";

export function ChatPanel({
  apiUrl,
  agentName,
  agentPhoto,
  agentOnline,
  messages,
  connected,
  isClosed,
  agentTyping,
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
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, agentTyping]);

  const busy = sending || progress !== null;
  const hasText = draft.trim().length > 0;
  const canSend = connected && !isClosed && !busy && (hasText || staged !== null);

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
    <>
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <AgentAvatar
          apiUrl={apiUrl}
          name={agentName}
          photo={agentPhoto}
          size={36}
          online={agentOnline}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{agentName}</p>
          <p className="text-xs text-slate-500">
            {agentTyping ? "typing…" : agentOnline ? "Online · Support agent" : "Support agent"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">Say hello to start the conversation.</p>
        ) : (
          messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              apiUrl={apiUrl}
              message={message}
              agent={{ name: agentName, photo: agentPhoto }}
              // A photo on the last message of each run from the agent, as chat apps do.
              showAgentPhoto={
                message.senderType === "AGENT" && messages[index + 1]?.senderType !== "AGENT"
              }
            />
          ))
        )}
        {agentTyping && (
          <div className="flex items-end justify-start gap-2" aria-live="polite">
            <AgentAvatar apiUrl={apiUrl} name={agentName} photo={agentPhoto} size={24} />
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2">
              <TypingDots />
              <span className="text-xs text-slate-500">{agentName} is typing</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {isClosed ? (
        <div className="flex flex-col gap-2 border-t border-slate-100 p-4">
          <p className="text-sm text-slate-500">This conversation has been closed.</p>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Start a new chat
          </button>
        </div>
      ) : (
        <div className="border-t border-slate-100">
          {staged && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">{staged.file.name}</p>
                <p className="text-[11px] text-slate-500">
                  {formatBytes(staged.file.size)}
                  {progress !== null && ` · uploading ${Math.round(progress * 100)}%`}
                </p>
                {progress !== null && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900 transition-[width]"
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
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          )}

          {error && <p className="px-3 pt-2 text-xs text-red-600">{error}</p>}

          {recorder.recording ? (
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={recorder.cancel}
                aria-label="Discard recording"
                className={`${iconButton} text-red-600 hover:bg-red-50`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
                className="flex flex-1 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                aria-live="polite"
              >
                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-red-500"
                  aria-hidden="true"
                />
                <span className="font-medium tabular-nums text-slate-900">
                  {formatDuration(recorder.elapsedMs)}
                </span>
                <LiveWaveform levels={recorder.levels} count={Math.round(LIVE_BARS * 0.6)} />
                <span className="sr-only">Recording…</span>
              </div>
              <button
                type="button"
                onClick={() => void sendVoice()}
                aria-label="Send voice message"
                className={`${iconButton} bg-slate-900 text-white hover:bg-slate-700`}
              >
                <SendIcon />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex items-center gap-2 p-3">
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
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!connected || busy}
                aria-label="Attach a photo, video or audio file"
                className={`${iconButton} text-slate-500 hover:bg-slate-100 hover:text-slate-800`}
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
                    d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"
                  />
                </svg>
              </button>
              <input
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  onTyping();
                }}
                placeholder={
                  !connected ? "Reconnecting..." : staged ? "Add a caption…" : "Type a message..."
                }
                disabled={!connected}
                aria-label={staged ? "Caption" : "Message"}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
              />
              {hasText || staged ? (
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className={`${iconButton} bg-slate-900 text-white hover:bg-slate-700`}
                >
                  {progress !== null ? (
                    <span className="text-[10px] font-semibold">{Math.round(progress * 100)}%</span>
                  ) : (
                    <SendIcon />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void recorder.start()}
                  disabled={!connected || busy}
                  aria-label="Record a voice message"
                  className={`${iconButton} bg-slate-900 text-white hover:bg-slate-700`}
                >
                  {progress !== null ? (
                    <span className="text-[10px] font-semibold">{Math.round(progress * 100)}%</span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path strokeLinecap="round" d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                  )}
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h15m0 0-6-6m6 6-6 6" />
    </svg>
  );
}
