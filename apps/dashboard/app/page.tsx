"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CloudOff, Search } from "lucide-react";
import type { Agent } from "@repo/types";
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
  const inbox = useInbox(agent.id, token);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [query, setQuery] = useState("");
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return inbox.conversations;
    return inbox.conversations.filter(
      (row) =>
        row.visitor.name.toLowerCase().includes(needle) ||
        row.visitor.email.toLowerCase().includes(needle) ||
        (row.lastMessage?.content ?? "").toLowerCase().includes(needle),
    );
  }, [inbox.conversations, query]);

  return (
    <div className="flex h-screen bg-chat-bg">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-chat-panel">
        {/* Own identity and availability, the way a chat client puts you at the top. */}
        <div className="flex items-center gap-3 border-b px-3 py-2.5">
          <Avatar name={agent.name} seed={agent.id} size="md" online={agent.isOnline} />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{agent.name}</h1>
            {/* Availability and socket health are different facts: an agent
                still needs to see whether they are online while the connection
                is re-establishing. */}
            <p className="text-xs text-chat-meta">
              <span>{agent.isOnline ? "Online" : "Offline"}</span>
              {!inbox.connected && <span className="text-amber-600"> · reconnecting...</span>}
            </p>
          </div>

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
        </div>

        <div className="flex-1 overflow-y-auto">
          {inbox.loading ? (
            <p className="p-4 text-sm text-chat-meta">Loading...</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-chat-meta">
              {inbox.conversations.length === 0
                ? "Nothing open. New chats appear here the moment they are assigned."
                : "No conversations match that search."}
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
                      <span className="shrink-0 text-[10px] text-chat-meta">
                        {formatListTime(conversation.updatedAt)}
                      </span>
                    </span>

                    {typing ? (
                      <span className="block truncate text-xs font-medium text-emerald-600">
                        typing...
                      </span>
                    ) : drafts[conversation.id] ? (
                      <span className="block truncate text-xs text-chat-meta">
                        <span className="text-amber-600">Draft: </span>
                        {drafts[conversation.id]}
                      </span>
                    ) : (
                      <span className="block truncate text-xs text-chat-meta">
                        {conversation.lastMessage
                          ? (conversation.lastMessage.senderType === "AGENT" ? "You: " : "") +
                            conversation.lastMessage.content
                          : "No messages yet"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t px-3 py-2">
          <Button variant="ghost" size="sm" onClick={onLogout} className="w-full">
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!inbox.connected && (
          <p
            role="status"
            className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-800"
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
          onTyping={inbox.notifyTyping}
          onClose={inbox.close}
        />
      </main>
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
