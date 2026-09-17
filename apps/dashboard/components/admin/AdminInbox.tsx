"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Headset,
  Info,
  Lock,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Search,
  X,
} from "lucide-react";
import {
  applyReceipt,
  describeAttachment,
  type AdminConversationDetail,
  type AdminConversationSummary,
  type BranchWithAgents,
  type ClientToServerEvents,
  type ConversationStatus,
  type Message,
  type ServerToClientEvents,
} from "@repo/types";
import { Bubble, DaySeparator, TypingDots } from "@/components/ConversationView";
import { ReceiptTicks } from "@/components/ReceiptTicks";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatListTime, isNewDay } from "@/lib/format";
import { cn } from "@/lib/utils";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const STATUS_CHIPS: Array<{ value: ConversationStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Open" },
  { value: "CLOSED", label: "Closed" },
];

/** New conversations are not broadcast to admins, so the list re-polls quietly. */
const LIST_REFRESH_MS = 30_000;
/** How long a typing notice stays up without a follow-up. */
const TYPING_TTL_MS = 4_000;

function formatFull(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The admin's view of every conversation, laid out like WhatsApp: the chat list
 * on the left, the open chat on the right, and contact info on demand. It is
 * read-only, but live — new messages and typing arrive as they happen.
 */
export function AdminInbox({
  token,
  initialConversationId,
}: {
  token: string;
  initialConversationId: string | null;
}) {
  const [rows, setRows] = useState<AdminConversationSummary[] | null>(null);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<ConversationStatus | "">("");
  const [query, setQuery] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  const [detail, setDetail] = useState<AdminConversationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [typing, setTyping] = useState<Record<string, "AGENT" | "VISITOR" | undefined>>({});

  const socketRef = useRef<AppSocket | null>(null);
  const joinedRef = useRef<Set<string>>(new Set());
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // A search result for another chat navigates to this same page with a new id.
  useEffect(() => {
    if (initialConversationId) setSelectedId(initialConversationId);
  }, [initialConversationId]);

  /* ------------------------------- loading ------------------------------- */

  useEffect(() => {
    void api<BranchWithAgents[]>("/api/admin/branches", { token })
      .then(setBranches)
      .catch(() => undefined);
  }, [token]);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (branchId) params.set("branchId", branchId);
    if (status) params.set("status", status);
    try {
      setRows(
        await api<AdminConversationSummary[]>(`/api/admin/conversations?${params}`, { token }),
      );
      setListError(null);
    } catch {
      setListError("Could not load conversations");
    }
  }, [token, branchId, status]);

  useEffect(() => {
    void loadList();
    const timer = setInterval(() => void loadList(), LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const next = await api<AdminConversationDetail>(`/api/admin/conversations/${id}`, {
          token,
        });
        if (selectedRef.current === id) {
          setDetail(next);
          setDetailError(null);
        }
      } catch {
        if (selectedRef.current === id) setDetailError("Could not load that conversation");
      }
    },
    [token],
  );

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (selectedId) void loadDetail(selectedId);
    // Keep the address shareable without remounting the whole admin shell.
    const path = selectedId ? `/admin/conversations/${selectedId}` : "/admin/conversations";
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [selectedId, loadDetail]);

  /* -------------------------------- realtime ------------------------------ */

  useEffect(() => {
    const socket: AppSocket = io(API_URL, {
      auth: { role: "ADMIN", token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    const joined = joinedRef.current;

    // Rooms are forgotten on reconnect, so rejoin whatever we were watching and
    // refetch anything that may have been said while the socket was down.
    socket.on("connect", () => {
      for (const id of joined) socket.emit("conversation:join", { conversationId: id });
      void loadList();
      if (selectedRef.current) void loadDetail(selectedRef.current);
    });

    socket.on("message:new", (message: Message) => {
      setRows((current) => {
        if (!current) return current;
        const index = current.findIndex((row) => row.id === message.conversationId);
        if (index === -1) return current;
        const row = current[index]!;
        const updated = {
          ...row,
          lastMessage: message,
          messageCount: row.messageCount + 1,
          updatedAt: message.createdAt,
        };
        // Most recent activity floats to the top, as in any chat list.
        return [updated, ...current.slice(0, index), ...current.slice(index + 1)];
      });
      setDetail((current) =>
        current &&
        current.id === message.conversationId &&
        !current.messages.some((m) => m.id === message.id)
          ? { ...current, messages: [...current.messages, message] }
          : current,
      );
      setTyping((current) => ({ ...current, [message.conversationId]: undefined }));
    });

    // Admins only watch the ticks change; their own viewing never marks anything read.
    socket.on("message:receipt", (receipt) => {
      setRows((current) =>
        current?.map((row) =>
          row.id === receipt.conversationId && row.lastMessage
            ? { ...row, lastMessage: applyReceipt([row.lastMessage], receipt)[0]! }
            : row,
        ) ?? current,
      );
      setDetail((current) =>
        current && current.id === receipt.conversationId
          ? { ...current, messages: applyReceipt(current.messages, receipt) }
          : current,
      );
    });

    socket.on("typing:update", ({ conversationId, senderType, isTyping }) => {
      clearTimeout(typingTimers.current[conversationId]);
      setTyping((current) => ({ ...current, [conversationId]: isTyping ? senderType : undefined }));
      if (isTyping) {
        typingTimers.current[conversationId] = setTimeout(
          () => setTyping((current) => ({ ...current, [conversationId]: undefined })),
          TYPING_TTL_MS,
        );
      }
    });

    socket.on("conversation:closed", (conversation) => {
      setRows(
        (current) =>
          current?.map((row) =>
            row.id === conversation.id
              ? { ...row, status: conversation.status, closedAt: conversation.closedAt }
              : row,
          ) ?? current,
      );
      setDetail((current) =>
        current && current.id === conversation.id
          ? { ...current, status: conversation.status, closedAt: conversation.closedAt }
          : current,
      );
    });

    const timers = typingTimers.current;
    return () => {
      socket.close();
      socketRef.current = null;
      joined.clear();
      Object.values(timers).forEach(clearTimeout);
    };
  }, [token, loadList, loadDetail]);

  // Watch every open conversation in the list (for live previews and typing),
  // plus the selected one even if it is closed.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !rows) return;
    const wanted = new Set(rows.filter((row) => row.status === "ACTIVE").map((row) => row.id));
    if (selectedId) wanted.add(selectedId);
    const joined = joinedRef.current;
    for (const id of wanted) {
      if (!joined.has(id)) {
        socket.emit("conversation:join", { conversationId: id });
        joined.add(id);
      }
    }
    for (const id of [...joined]) {
      if (!wanted.has(id)) {
        socket.emit("conversation:leave", { conversationId: id });
        joined.delete(id);
      }
    }
  }, [rows, selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.id, detail?.messages.length, selectedId && typing[selectedId]]);

  /* --------------------------------- derived ------------------------------ */

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!rows || !needle) return rows ?? [];
    return rows.filter(
      (row) =>
        row.visitor.name.toLowerCase().includes(needle) ||
        row.visitor.email.toLowerCase().includes(needle) ||
        row.visitor.phone.includes(needle) ||
        row.agent.name.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const openCount = rows?.filter((row) => row.status === "ACTIVE").length ?? 0;
  const selectedRow = rows?.find((row) => row.id === selectedId) ?? null;
  const selectedTyping = selectedId ? typing[selectedId] : undefined;

  /* ---------------------------------- view -------------------------------- */

  return (
    // Cancels the shell's page padding so the panes run edge to edge under the top bar.
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] overflow-hidden md:-mx-6">
      {/* ------------------------------ chat list ----------------------------- */}
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r bg-chat-panel md:w-96",
          selectedId && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between bg-chat-header px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Conversations</h1>
            <p className="text-xs text-chat-meta">
              {rows ? `${openCount} open · ${rows.length} shown` : "Loading…"}
            </p>
          </div>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Filter by branch"
            className="h-8 max-w-36 rounded-lg border-0 bg-chat-panel px-2 text-xs"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 border-b px-3 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-chat-meta"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, phone or agent"
              aria-label="Search conversations"
              className="h-9 w-full rounded-lg bg-chat-header pr-3 pl-10 text-sm placeholder:text-chat-meta focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div role="radiogroup" aria-label="Filter by status" className="flex gap-1.5">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                role="radio"
                aria-checked={status === chip.value}
                onClick={() => setStatus(chip.value)}
                className={cn(
                  "rounded-full bg-chat-header px-3 py-1 text-xs font-medium text-chat-meta transition-colors hover:text-foreground",
                  status === chip.value && "bg-success-soft text-success hover:text-success",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listError && <p className="px-4 py-3 text-sm text-destructive">{listError}</p>}
          {rows && visible.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-chat-meta">
              {query ? `No conversations match “${query}”` : "No conversations here yet"}
            </p>
          )}
          {visible.map((row) => (
            <ChatRow
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              typing={typing[row.id]}
              onSelect={() => {
                setSelectedId(row.id);
                setShowInfo(false);
              }}
            />
          ))}
        </div>
      </aside>

      {/* ------------------------------ chat pane ----------------------------- */}
      <section
        className={cn("flex min-w-0 flex-1 flex-col", !selectedId && "hidden md:flex")}
        aria-label="Conversation"
      >
        {!selectedId ? (
          <EmptyPane />
        ) : (
          <>
            <header className="flex items-center gap-3 border-b bg-chat-header px-3 py-2 md:px-4">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Back to conversations"
                className="flex size-9 items-center justify-center rounded-full text-chat-meta hover:bg-accent md:hidden"
              >
                <ArrowLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowInfo((value) => !value)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label="Show contact info"
              >
                <Avatar
                  name={detail?.visitor.name ?? selectedRow?.visitor.name ?? "?"}
                  seed={detail?.visitor.id ?? selectedRow?.visitor.id}
                  size="md"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {detail?.visitor.name ?? selectedRow?.visitor.name ?? "Loading…"}
                  </span>
                  <span className="block truncate text-xs text-chat-meta">
                    {selectedTyping ? (
                      <span className="font-medium text-success">
                        {selectedTyping === "AGENT"
                          ? `${detail?.agent.name ?? "Agent"} is typing…`
                          : "typing…"}
                      </span>
                    ) : detail ? (
                      `with ${detail.agent.name} · ${detail.branch.name}`
                    ) : (
                      "click for contact info"
                    )}
                  </span>
                </span>
              </button>
              {detail && (
                <span
                  className={cn(
                    "hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline",
                    detail.status === "ACTIVE"
                      ? "bg-success-soft text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {detail.status === "ACTIVE" ? "Open" : "Closed"}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowInfo((value) => !value)}
                aria-label="Contact info"
                aria-pressed={showInfo}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-chat-meta transition-colors hover:bg-accent",
                  showInfo && "bg-accent text-foreground",
                )}
              >
                <Info className="size-5" />
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="chat-canvas flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3 md:px-[6%]">
                  {detailError && (
                    <p className="m-auto rounded-lg bg-chat-panel px-4 py-2 text-sm text-destructive shadow-sm">
                      {detailError}
                    </p>
                  )}
                  {!detail && !detailError && (
                    <p className="m-auto rounded-full bg-chat-panel px-4 py-2 text-sm text-chat-meta shadow-sm">
                      Loading messages…
                    </p>
                  )}
                  {detail && (
                    <>
                      <div className="my-2 flex justify-center">
                        <span className="flex max-w-md items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-1.5 text-center text-[11px] text-warning shadow-sm">
                          <Lock className="size-3 shrink-0" aria-hidden />
                          You are viewing this chat as an administrator. Messages are between the
                          visitor and {detail.agent.name}.
                        </span>
                      </div>
                      {detail.messages.length === 0 && (
                        <p className="mx-auto rounded-lg bg-chat-panel px-3 py-1.5 text-xs text-chat-meta shadow-sm">
                          No messages yet
                        </p>
                      )}
                      {detail.messages.map((message, index) => (
                        <div key={message.id} className="flex flex-col gap-1.5">
                          {isNewDay(message.createdAt, detail.messages[index - 1]?.createdAt) && (
                            <DaySeparator iso={message.createdAt} />
                          )}
                          <Bubble
                            message={message}
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
                      {selectedTyping && (
                        <div
                          className={cn(
                            "flex",
                            selectedTyping === "AGENT" ? "justify-end" : "justify-start",
                          )}
                          aria-live="polite"
                        >
                          <div
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 shadow-sm",
                              selectedTyping === "AGENT" ? "chat-bubble-out" : "chat-bubble-in",
                            )}
                          >
                            <TypingDots />
                            <span className="sr-only">
                              {selectedTyping === "AGENT" ? detail.agent.name : detail.visitor.name}{" "}
                              is typing
                            </span>
                          </div>
                        </div>
                      )}
                      {detail.status === "CLOSED" && detail.closedAt && (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-lg bg-chat-panel px-3 py-1 text-[11px] font-medium text-chat-meta shadow-sm">
                            Conversation closed · {formatFull(detail.closedAt)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div ref={endRef} />
                </div>

                {/* Where the composer would be: WhatsApp's "only admins can send" bar. */}
                <div className="flex items-center justify-center gap-2 border-t bg-chat-header px-4 py-3 text-center text-sm text-chat-meta">
                  <Lock className="size-4 shrink-0" aria-hidden />
                  {detail
                    ? detail.status === "ACTIVE"
                      ? `Only ${detail.agent.name} can reply to this conversation.`
                      : "This conversation is closed."
                    : "Read-only"}
                </div>
              </div>

              {showInfo && detail && (
                <ContactInfo detail={detail} onClose={() => setShowInfo(false)} />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------- pieces --------------------------------- */

function ChatRow({
  row,
  selected,
  typing,
  onSelect,
}: {
  row: AdminConversationSummary;
  selected: boolean;
  typing: "AGENT" | "VISITOR" | undefined;
  onSelect: () => void;
}) {
  const last = row.lastMessage;
  const fromAgent = last?.senderType === "AGENT";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 px-3 text-left transition-colors hover:bg-chat-header",
        selected && "bg-accent hover:bg-accent",
      )}
    >
      <Avatar name={row.visitor.name} seed={row.visitor.id} size="lg" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b py-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium">{row.visitor.name}</span>
          <span
            className={cn(
              "shrink-0 text-[11px]",
              row.status === "ACTIVE" ? "text-success" : "text-chat-meta",
            )}
          >
            {formatListTime(last?.createdAt ?? row.updatedAt)}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-[13px] text-chat-meta">
            {typing ? (
              <span className="truncate font-medium text-success">
                {typing === "AGENT" ? `${row.agent.name} is typing…` : "typing…"}
              </span>
            ) : last ? (
              <>
                {fromAgent && <ReceiptTicks message={last} className="size-4" />}
                <span className="truncate">
                  {fromAgent ? `${row.agent.name.split(" ")[0]}: ` : ""}
                  {last.content ||
                    (last.attachment
                      ? describeAttachment(last.attachment.kind, last.attachment.durationMs)
                      : "")}
                </span>
              </>
            ) : (
              <span className="italic">No messages yet</span>
            )}
          </span>
          {row.status === "CLOSED" ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Closed
            </span>
          ) : (
            <span className="max-w-24 shrink-0 truncate rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
              {row.branch.name}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function ContactInfo({
  detail,
  onClose,
}: {
  detail: AdminConversationDetail;
  onClose: () => void;
}) {
  return (
    <aside
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l bg-chat-panel shadow-xl lg:static lg:w-80 lg:shadow-none"
      aria-label="Contact info"
    >
      <div className="flex items-center gap-3 bg-chat-header px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact info"
          className="flex size-8 items-center justify-center rounded-full text-chat-meta hover:bg-accent"
        >
          <X className="size-5" />
        </button>
        <h2 className="text-sm font-semibold">Contact info</h2>
      </div>

      <div className="flex-1 overflow-y-auto bg-background">
        <div className="flex flex-col items-center gap-1 bg-chat-panel px-4 py-6 text-center">
          <Avatar
            name={detail.visitor.name}
            seed={detail.visitor.id}
            size="lg"
            className="mb-2 scale-150"
          />
          <p className="mt-3 text-lg font-semibold">{detail.visitor.name}</p>
          <p className="text-sm text-chat-meta">{detail.visitor.phone}</p>
        </div>

        <InfoSection title="Contact">
          <InfoRow icon={Mail} label="Email">
            <a href={`mailto:${detail.visitor.email}`} className="text-success hover:underline">
              {detail.visitor.email}
            </a>
          </InfoRow>
          <InfoRow icon={Phone} label="Phone">
            <a href={`tel:${detail.visitor.phone}`} className="text-success hover:underline">
              {detail.visitor.phone}
            </a>
          </InfoRow>
        </InfoSection>

        <InfoSection title="Conversation">
          <InfoRow icon={Headset} label="Assigned agent">
            <span className="flex items-center gap-1.5">
              {detail.agent.name}
              <span
                className={cn(
                  "size-2 rounded-full",
                  detail.agent.isOnline ? "bg-online" : "bg-muted-foreground/50",
                )}
                aria-label={detail.agent.isOnline ? "online" : "offline"}
              />
            </span>
          </InfoRow>
          <InfoRow icon={Building2} label="Branch">
            {detail.branch.name}
          </InfoRow>
          <InfoRow icon={MessageCircle} label="Messages">
            {detail.messages.length}
          </InfoRow>
          <InfoRow icon={CalendarClock} label="Started">
            {formatFull(detail.createdAt)}
          </InfoRow>
          {detail.closedAt && (
            <InfoRow icon={Lock} label="Closed">
              {formatFull(detail.closedAt)}
            </InfoRow>
          )}
        </InfoSection>
      </div>
    </aside>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-2 bg-chat-panel px-4 py-3">
      <h3 className="mb-2 text-xs font-medium text-chat-meta">{title}</h3>
      <dl className="flex flex-col gap-3">{children}</dl>
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-chat-meta" aria-hidden />
      <div className="min-w-0">
        <dt className="text-[11px] text-chat-meta">{label}</dt>
        <dd className="text-sm break-words">{children}</dd>
      </div>
    </div>
  );
}

function EmptyPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 border-b-4 border-primary bg-chat-header px-6 text-center">
      <span className="flex size-24 items-center justify-center rounded-full bg-success-soft text-primary">
        <MessagesSquare className="size-12" aria-hidden />
      </span>
      <div className="max-w-sm">
        <h2 className="text-2xl font-light">Conversation monitor</h2>
        <p className="mt-2 text-sm text-chat-meta">
          Select a chat to follow it live. You can read every conversation in your company, while
          replying stays with the assigned agent.
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-chat-meta">
        <Lock className="size-3" aria-hidden />
        Read-only for administrators
      </p>
    </div>
  );
}
