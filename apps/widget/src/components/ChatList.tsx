import { useMemo } from "react";
import { describeAttachment, type VisitorConversationSummary } from "@repo/types";
import { AgentAvatar } from "./AgentAvatar.js";
import { formatClock, formatDayLabel } from "../lib/format.js";

/**
 * One agent, one row — however many conversations they have had with them.
 *
 * A chat that was closed and started again is the same person as far as the
 * visitor is concerned, so the list shows them once and the thread behind the
 * row carries the lot. Counts and the preview come from the newest of them.
 */
interface AgentThread {
  agentId: string;
  agent: VisitorConversationSummary["agent"];
  branch: VisitorConversationSummary["branch"];
  latest: VisitorConversationSummary;
  unreadCount: number;
  /** Open when any conversation in it still is. */
  isOpen: boolean;
}

function groupByAgent(rows: VisitorConversationSummary[]): AgentThread[] {
  const threads = new Map<string, AgentThread>();

  for (const row of rows) {
    const found = threads.get(row.agent.id);
    if (!found) {
      threads.set(row.agent.id, {
        agentId: row.agent.id,
        agent: row.agent,
        branch: row.branch,
        latest: row,
        unreadCount: row.unreadCount,
        isOpen: row.status === "ACTIVE",
      });
      continue;
    }
    found.unreadCount += row.unreadCount;
    found.isOpen = found.isOpen || row.status === "ACTIVE";
    if (row.updatedAt > found.latest.updatedAt) {
      found.latest = row;
      found.agent = row.agent;
      found.branch = row.branch;
    }
  }

  // The caller hands them over newest first, and a Map keeps what it was given.
  return [...threads.values()];
}

/**
 * Every chat this person has, the way a phone shows them.
 *
 * The point of the list is that a visitor is not limited to one conversation:
 * they can be mid-answer with one agent and still open another, and come back
 * to either. Closed chats stay in it — they are worth re-reading — and say so
 * rather than pretending to be live.
 */
export function ChatList({
  apiUrl,
  conversations,
  busy,
  error,
  onOpen,
  onNew,
}: {
  apiUrl: string;
  conversations: VisitorConversationSummary[];
  busy: boolean;
  error?: string | null;
  /** Opens everything this visitor has with one agent, as a single thread. */
  onOpen: (agentId: string) => void;
  onNew: () => void;
}) {
  const threads = useMemo(() => groupByAgent(conversations), [conversations]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {error && (
        <p role="alert" className="border-b border-wa-divider px-4 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {threads.length === 0 && !busy && (
          <p className="px-4 py-10 text-center text-sm text-wa-meta">
            No chats yet. Start one below.
          </p>
        )}

        {threads.map((thread) => {
          const row = thread.latest;
          const last = row.lastMessage;
          const preview = last
            ? last.content ||
              (last.attachment
                ? describeAttachment(last.attachment.kind, last.attachment.durationMs)
                : "")
            : "No messages yet";

          return (
            <button
              key={thread.agentId}
              type="button"
              onClick={() => onOpen(thread.agentId)}
              className="flex w-full items-center gap-3 px-3 text-left transition hover:bg-black/[0.03]"
            >
              <span className="relative shrink-0 py-2.5">
                <AgentAvatar
                  apiUrl={apiUrl}
                  name={thread.agent.name}
                  photo={thread.agent.avatarUrl}
                />
                {thread.agent.isOnline && thread.isOpen && (
                  <span
                    className="absolute right-0 bottom-2.5 size-3 rounded-full bg-wa-launcher ring-2 ring-white"
                    aria-label="online"
                  />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-wa-divider py-3">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-medium text-wa-text">
                    {thread.agent.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-wa-meta">
                    {stamp(last?.createdAt ?? row.updatedAt)}
                  </span>
                </span>

                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] text-wa-meta">
                    {last?.senderType === "VISITOR" && "You: "}
                    {preview}
                  </span>
                  {thread.unreadCount > 0 ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wa-launcher px-1.5 text-[11px] font-semibold text-white">
                      {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                    </span>
                  ) : (
                    !thread.isOpen && (
                      <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-wa-meta">
                        Ended
                      </span>
                    )
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-wa-divider bg-wa-panel p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onNew}
          disabled={busy}
          className="w-full rounded-lg bg-wa-green px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Start a new chat
        </button>
      </div>
    </div>
  );
}

/** Today's chats carry a clock; older ones the day they last moved. */
function stamp(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  return sameDay ? formatClock(iso) : formatDayLabel(iso);
}
