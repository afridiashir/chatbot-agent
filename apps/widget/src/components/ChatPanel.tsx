import { useEffect, useRef, useState } from "react";
import type { Message } from "@repo/types";

interface ChatPanelProps {
  agentName: string;
  messages: Message[];
  connected: boolean;
  isClosed: boolean;
  agentTyping: boolean;
  onSend: (content: string) => Promise<void>;
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

function MessageBubble({ message }: { message: Message }) {
  const fromVisitor = message.senderType === "VISITOR";

  return (
    <div className={fromVisitor ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
          fromVisitor ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800",
        ].join(" ")}
      >
        {message.content}
      </div>
    </div>
  );
}

export function ChatPanel({
  agentName,
  messages,
  connected,
  isClosed,
  agentTyping,
  onSend,
  onTyping,
  onStartOver,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, agentTyping]);

  const canSend = connected && !isClosed && !sending && draft.trim().length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;

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

  return (
    <>
      <div className="border-b border-slate-100 px-4 py-2">
        <p className="text-xs text-slate-500">
          Agent: <span className="font-medium text-slate-800">{agentName}</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">Say hello to start the conversation.</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {agentTyping && (
          <div className="flex justify-start" aria-live="polite">
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
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-100 p-3">
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              onTyping();
            }}
            placeholder={connected ? "Type a message..." : "Reconnecting..."}
            disabled={!connected}
            aria-label="Message"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h15m0 0-6-6m6 6-6 6" />
            </svg>
          </button>
        </form>
      )}
    </>
  );
}
