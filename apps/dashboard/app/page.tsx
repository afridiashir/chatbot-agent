"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Camera, CloudOff, Link2, Search } from "lucide-react";
import { ChatLinkDialog } from "@/components/ChatLinkDialog";
import { isMuted, playChime, setMuted, unlockSound } from "@/lib/sound";
import { ProfilePhotoDialog } from "@/components/ProfilePhotoDialog";
import { ReceiptTicks } from "@/components/ReceiptTicks";
import { describeAttachment, type Agent } from "@repo/types";
import { ConversationView } from "@/components/ConversationView";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useInbox } from "@/hooks/useInbox";
import { useSession } from "@/hooks/useSession";
import { formatListTime } from "@/lib/format";
import { loadDrafts } from "@/lib/outbox";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { agent, token, loading, logout, setAgent } = useSession();

  useEffect(() => {
    if (!loading && !agent) router.replace("/login");
  }, [agent, loading, router]);

  if (loading) return <Centered>Loading...</Centered>;
  if (!agent || !token) return <Centered>Redirecting to sign in...</Centered>;

  return <Dashboard agent={agent} token={token} onAgentChange={setAgent} onLogout={logout} />;
}

function Dashboard({
  agent,
  token,
  onAgentChange,
  onLogout,
}: {
  agent: Agent;
  token: string;
  onAgentChange: (agent: Agent) => void;
  onLogout: () => void;
}) {
  const inbox = useInbox(agent.id, token, (profile) =>
    onAgentChange({ ...agent, name: profile.name, avatarUrl: profile.avatarUrl }),
  );
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [query, setQuery] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [muted, setMutedState] = useState(false);

  // Read after mount: localStorage does not exist while rendering on the server.
  useEffect(() => setMutedState(isMuted()), []);

  // Browsers keep audio silent until the person interacts with the page, so the
  // first click or key press after sign-in is what enables the chimes.
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function toggleMuted() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    // Unmuting plays the tone once, so the agent hears what to listen for.
    if (!next) playChime("message");
  }
  const [tab, setTab] = useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Re-read after any send or selection change so the list’s draft hints
  // track what is actually stored.
  useEffect(() => {
    setDrafts(loadDrafts());
  }, [inbox.selectedId, inbox.pendingCount, inbox.conversations]);

  async function toggleAvailability() {
    setTogglingStatus(true);
    try {
      onAgentChange(await inbox.setOnline(!agent.isOnline));
    } finally {
      setTogglingStatus(false);
    }
  }

  const counts = useMemo(
    () => ({
      ACTIVE: inbox.conversations.filter((row) => row.status === "ACTIVE").length,
      CLOSED: inbox.conversations.filter((row) => row.status === "CLOSED").length,
    }),
    [inbox.conversations],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inTab = inbox.conversations.filter((row) => row.status === tab);
    if (!needle) return inTab;
    return inTab.filter(
      (row) =>
        row.visitor.name.toLowerCase().includes(needle) ||
        row.visitor.email.toLowerCase().includes(needle) ||
        (row.lastMessage?.content ?? "").toLowerCase().includes(needle),
    );
  }, [inbox.conversations, query, tab]);

  return (
    <div className="flex h-screen bg-chat-bg">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-chat-panel">
        {/* Own identity and availability, the way a chat client puts you at the top. */}
        <div className="flex items-center gap-3 border-b bg-chat-header px-3 py-2.5">
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label="Change profile photo"
            title="Profile photo"
            className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Avatar
              name={agent.name}
              seed={agent.id}
              photo={agent.avatarUrl}
              size="md"
              online={agent.isOnline}
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="size-4" aria-hidden />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{agent.name}</h1>
            {/* Availability and socket health are different facts: an agent
                still needs to see whether they are online while the connection
                is re-establishing. */}
            <p className="text-xs text-chat-meta">
              <span>{agent.isOnline ? "Online" : "Offline"}</span>
              {!inbox.connected && <span className="text-warning"> · reconnecting...</span>}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMuted}
            aria-pressed={muted}
            aria-label={muted ? "Turn notification sound on" : "Turn notification sound off"}
            title={muted ? "Sound off" : "Sound on"}
          >
            {muted ? (
              <BellOff className="size-4 text-chat-meta" aria-hidden />
            ) : (
              <Bell className="size-4" aria-hidden />
            )}
          </Button>

          <Button
            variant={agent.isOnline ? "outline" : "default"}
            size="sm"
            onClick={toggleAvailability}
            disabled={togglingStatus}
          >
            {agent.isOnline ? "Go offline" : "Go online"}
          </Button>
        </div>

        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-chat-meta"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="w-full rounded-full border border-input bg-background py-1.5 pr-3 pl-8 text-xs placeholder:text-chat-meta focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div role="tablist" aria-label="Conversations" className="mt-2 flex gap-1.5">
            {(
              [
                ["ACTIVE", "Open"],
                ["CLOSED", "Closed"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full bg-chat-header px-3 py-1 text-xs font-medium text-chat-meta transition-colors hover:text-foreground",
                  tab === value && "bg-success-soft text-success hover:text-success",
                )}
              >
                {label}
                <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums">
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {inbox.loading ? (
            <p className="p-4 text-sm text-chat-meta">Loading...</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-chat-meta">
              {query.trim()
                ? "No conversations match that search."
                : tab === "ACTIVE"
                  ? "Nothing open. New chats appear here the moment they are assigned."
                  : "No closed conversations yet. Chats you close are kept here."}
            </p>
          ) : (
            visible.map((conversation) => {
              const typing = Boolean(inbox.typingIn[conversation.id]);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  data-testid="conversation-row"
                  onClick={() => inbox.select(conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                    inbox.selectedId === conversation.id && "bg-accent",
                  )}
                >
                  <Avatar
                    name={conversation.visitor.name}
                    seed={conversation.visitor.id}
                    size="lg"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {conversation.visitor.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-chat-meta">
                        {conversation.status === "CLOSED" && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">Closed</span>
                        )}
                        {formatListTime(conversation.closedAt ?? conversation.updatedAt)}
                      </span>
                    </span>

                    {typing ? (
                      <span className="block truncate text-xs font-medium text-success">
                        typing...
                      </span>
                    ) : drafts[conversation.id] ? (
                      <span className="block truncate text-xs text-chat-meta">
                        <span className="text-success">Draft: </span>
                        {drafts[conversation.id]}
                      </span>
                    ) : (
                      <span className="flex min-w-0 items-center gap-1 text-xs text-chat-meta">
                        {/* The agent's own last message carries its ticks, as in WhatsApp. */}
                        {conversation.lastMessage?.senderType === "AGENT" && (
                          <ReceiptTicks message={conversation.lastMessage} />
                        )}
                        <span className="truncate">
                          {conversation.lastMessage
                            ? conversation.lastMessage.content ||
                              (conversation.lastMessage.attachment
                                ? describeAttachment(
                                    conversation.lastMessage.attachment.kind,
                                    conversation.lastMessage.attachment.durationMs,
                                  )
                                : "")
                            : "No messages yet"}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex gap-1 border-t px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)} className="flex-1">
            <Link2 className="size-3.5" aria-hidden />
            My chat link
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout} className="flex-1">
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!inbox.connected && (
          <p
            role="status"
            className="flex items-center gap-2 border-b bg-warning-soft px-4 py-2 text-xs text-warning"
          >
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            {inbox.pendingCount > 0
              ? `Connection lost. ${inbox.pendingCount} message${
                  inbox.pendingCount === 1 ? "" : "s"
                } saved and waiting to send.`
              : "Connection lost. Keep replying - anything you send is saved and delivered when you are back."}
          </p>
        )}
        {inbox.error && (
          <p className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {inbox.error}
          </p>
        )}
        <ConversationView
          detail={inbox.detail}
          connected={inbox.connected}
          visitorTyping={inbox.selectedId ? Boolean(inbox.typingIn[inbox.selectedId]) : false}
          pending={inbox.pending}
          onSend={inbox.send}
          onSendMedia={inbox.sendMedia}
          onTyping={inbox.notifyTyping}
          onClose={inbox.close}
        />
      </main>
      <ChatLinkDialog
        target={linkOpen ? { kind: "agent", id: agent.id, name: agent.name } : null}
        onClose={() => setLinkOpen(false)}
      />
      <ProfilePhotoDialog
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        agent={agent}
        token={token}
        onChange={onAgentChange}
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
