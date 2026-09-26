import { useEffect, useState } from "react";
import type { WidgetConfig } from "./config.js";
import { AgentAvatar } from "./components/AgentAvatar.js";
import { ChatList } from "./components/ChatList.js";
import { PhoneGate } from "./components/PhoneGate.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { Launcher } from "./components/Launcher.js";
import { PreChatForm } from "./components/PreChatForm.js";
import { useChat } from "./hooks/useChat.js";
import { useVisualViewport } from "./hooks/useVisualViewport.js";
import { pushSupported } from "./lib/push.js";

export function Widget({ config }: { config: WidgetConfig }) {
  // The hosted chat page is the chat: always open, nothing to close it to.
  const page = config.mode === "page";
  const [isOpen, setIsOpen] = useState(page);
  const chat = useChat(config, isOpen);
  // With the keyboard open this is the strip of screen left above it.
  const viewport = useVisualViewport();
  const fitKeyboard = viewport
    ? { height: `${viewport.height}px`, top: `${viewport.offsetTop}px`, bottom: "auto" }
    : undefined;
  const chatting = chat.phase === "chatting" ? chat.conversation?.agent : undefined;
  // Before a chat starts, an agent's link already knows who you'll talk to.
  // On the list, nobody: it belongs to all of them at once.
  const agent = chatting ?? (chat.phase === "list" ? undefined : (chat.linkAgent ?? undefined));

  // Full screen on phones: stop the page underneath from scrolling while the
  // chat covers it, and put the host page back exactly as it was on close.
  useEffect(() => {
    if (page || !isOpen || !window.matchMedia("(max-width: 639px)").matches) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [isOpen, page]);

  const panel = (
    <section
      aria-label="Support chat"
      className={
        page
          ? // The hosted page: the whole screen on phones, a centred card on
            // larger screens, like WhatsApp Web.
            "relative flex h-full max-h-[100dvh] w-full flex-col overflow-hidden bg-wa-panel sm:h-[min(calc(100dvh-3rem),46rem)] sm:max-w-md sm:rounded-2xl sm:shadow-[0_12px_40px_rgb(0_0_0/0.18)]"
          : // Phones: the whole screen, like the WhatsApp app (dvh follows the
            // on-screen keyboard). From 640px up: the floating panel. Positioned
            // either way, so the media viewer can cover it.
            "fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-wa-panel sm:relative sm:inset-auto sm:h-[36rem] sm:max-h-[calc(100vh-6rem)] sm:w-[23rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:shadow-[0_12px_40px_rgb(0_0_0/0.25)]"
      }
      style={page ? undefined : fitKeyboard}
    >
      {/* WhatsApp's teal header: the agent once known, a welcome before. */}
      <header className="flex items-center gap-3 bg-wa-teal px-3 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 text-white">
        {/* Back to the list, where a phone puts it. Only once there is a list
            to go back to: on the way in there is nothing behind this screen. */}
        {chat.phase === "chatting" && (
          <button
            type="button"
            onClick={chat.back}
            aria-label="Back to your chats"
            className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        {agent ? (
          <>
            <AgentAvatar
              apiUrl={config.apiUrl}
              name={agent.name}
              photo={agent.avatarUrl ?? null}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] leading-tight font-medium">{agent.name}</h2>
              <p className="truncate text-xs text-white/80" aria-live="polite">
                {chat.agentTyping
                  ? "typing…"
                  : chat.isClosed
                    ? "Conversation ended"
                    : agent.isOnline
                      ? "online"
                      : "away · replies when back"}
              </p>
            </div>

            {/* Their number, where they have given one: a visitor who would
                rather call than type should not have to ask for it. */}
            {agent.phone && (
              <a
                href={`tel:${agent.phone.replace(/\s/g, "")}`}
                aria-label={`Call ${agent.name} on ${agent.phone}`}
                title={agent.phone}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z" />
                </svg>
              </a>
            )}
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.5 2 2 6.2 2 11.4c0 2 .7 3.9 1.9 5.4L2.6 21.3a.5.5 0 0 0 .6.6l4.7-1.3c1.2.5 2.6.8 4.1.8 5.5 0 10-4.2 10-9.4S17.5 2 12 2z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] leading-tight font-medium">
                {chat.phase === "list"
                  ? "Your chats"
                  : chat.lockedBranch
                    ? chat.lockedBranch.name
                    : "Chat with us"}
              </h2>
              <p className="truncate text-xs text-white/80">
                {chat.phase === "list" ? chat.phone : "We typically reply in a few minutes"}
              </p>
            </div>
          </>
        )}
        {!page && (
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
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
        )}
      </header>

      {chat.phase === "loading" && <Status>Loading…</Status>}

      {chat.phase === "identify" && (
        <PhoneGate
          agentName={chat.linkAgent?.name ?? null}
          branchName={chat.lockedBranch?.name ?? null}
          busy={chat.busy}
          error={chat.error}
          onSubmit={(phone) => void chat.identify(phone)}
        />
      )}

      {chat.phase === "list" && (
        <ChatList
          apiUrl={config.apiUrl}
          conversations={chat.conversations}
          busy={chat.busy}
          error={chat.error}
          onOpen={(id) => void chat.open(id)}
          onNew={chat.startNew}
        />
      )}

      {(chat.phase === "form" || chat.phase === "starting") && (
        <PreChatForm
          lockedBranch={chat.lockedBranch}
          agentName={chat.linkAgent?.name ?? null}
          saved={chat.savedVisitor}
          phone={chat.phone}
          submitting={chat.phase === "starting"}
          onStart={(visitor) => void chat.startChat(visitor)}
        />
      )}

      {chat.phase === "unavailable" && (
        <Notice
          text={chat.error ?? "No agents are currently available."}
          hint="Please check back soon."
          action="Try again"
          onAction={chat.startOver}
        />
      )}

      {chat.phase === "failed" && (
        <Notice
          text={chat.error ?? "Something went wrong."}
          action="Try again"
          onAction={chat.startOver}
        />
      )}

      {chat.phase === "chatting" && chat.conversation && (
        <ChatPanel
          apiUrl={config.apiUrl}
          agentName={chat.conversation.agent.name}
          agentOnline={chat.conversation.agent.isOnline}
          agentPhoto={chat.conversation.agent.avatarUrl ?? null}
          messages={chat.messages}
          notices={chat.notices}
          connected={chat.connected}
          isClosed={chat.isClosed}
          agentTyping={chat.agentTyping}
          error={chat.error}
          canPush={page && pushSupported()}
          visitorId={chat.visitorId}
          onSend={chat.sendMessage}
          onReact={chat.react}
          onSendMedia={chat.sendMedia}
          onTyping={chat.notifyTyping}
          onStartOver={chat.startOver}
          onOpenAgent={(agentId) => void chat.openAgent(agentId)}
        />
      )}
    </section>
  );

  if (page) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-[#d1d7db] font-sans"
        style={fitKeyboard}
      >
        {panel}
      </div>
    );
  }

  return (
    <div className="fixed right-4 bottom-4 z-[2147483000] flex flex-col items-end gap-3 font-sans">
      {isOpen && panel}

      {/* On phones the open chat covers the button; the header's close takes over. */}
      <div className={isOpen ? "hidden sm:block" : ""}>
        <Launcher isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />
      </div>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <p className="wa-canvas flex flex-1 items-center justify-center text-sm text-wa-meta">
      {children}
    </p>
  );
}

function Notice({
  text,
  hint,
  action,
  onAction,
}: {
  text: string;
  hint?: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="wa-canvas flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="wa-bubble-in max-w-[85%] px-3 py-2 text-left">
        <p className="text-sm">{text}</p>
        {hint && <p className="mt-1 text-xs text-wa-meta">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="rounded-full bg-wa-green px-5 py-2 text-sm font-medium text-white transition hover:brightness-95"
      >
        {action}
      </button>
    </div>
  );
}
