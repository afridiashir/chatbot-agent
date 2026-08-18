import { useState } from "react";
import type { WidgetConfig } from "./config.js";
import { PreChatForm } from "./components/PreChatForm.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { Launcher } from "./components/Launcher.js";
import { useChat } from "./hooks/useChat.js";

export function Widget({ config }: { config: WidgetConfig }) {
  const [isOpen, setIsOpen] = useState(false);
  const chat = useChat(config);

  const title = chat.phase === "chatting" ? "Chat with our team" : "Start a chat";

  return (
    <div className="fixed right-4 bottom-4 z-[2147483000] flex flex-col items-end gap-3 font-sans">
      {isOpen && (
        <section
          aria-label="Support chat"
          className="flex h-[28rem] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="text-slate-400 transition hover:text-slate-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          {chat.phase === "loading" && <Status>Loading...</Status>}

          {(chat.phase === "picking" || chat.phase === "starting") && (
            <PreChatForm
              branches={chat.branches}
              submitting={chat.phase === "starting"}
              onStart={(branchId, visitor) => void chat.startChat(branchId, visitor)}
            />
          )}

          {chat.phase === "unavailable" && (
            <div className="flex flex-1 flex-col justify-center gap-3 p-4 text-center">
              <p className="text-sm text-slate-700">
                {chat.error ?? "No agents are currently available."}
              </p>
              <p className="text-xs text-slate-500">Please try another branch or check back soon.</p>
              <button
                type="button"
                onClick={chat.startOver}
                className="mx-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                Choose another branch
              </button>
            </div>
          )}

          {chat.phase === "failed" && (
            <div className="flex flex-1 flex-col justify-center gap-3 p-4 text-center">
              <p className="text-sm text-slate-700">{chat.error ?? "Something went wrong."}</p>
              <button
                type="button"
                onClick={chat.startOver}
                className="mx-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                Try again
              </button>
            </div>
          )}

          {chat.phase === "chatting" && chat.conversation && (
            <ChatPanel
              agentName={chat.conversation.agent.name}
              messages={chat.messages}
              connected={chat.connected}
              isClosed={chat.isClosed}
              agentTyping={chat.agentTyping}
              onSend={chat.sendMessage}
              onTyping={chat.notifyTyping}
              onStartOver={chat.startOver}
            />
          )}

          {chat.phase === "chatting" && chat.error && (
            <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
              {chat.error}
            </p>
          )}
        </section>
      )}

      <Launcher isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center justify-center text-sm text-slate-400">{children}</p>;
}
