import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { applyReceipt } from "@repo/types";
import type {
  AssignmentResult,
  Branch,
  ClientToServerEvents,
  ConversationDetail,
  ConversationWithAgent,
  Message,
  PublicAgentProfile,
  ServerToClientEvents,
  VisitorConversationSummary,
  VisitorLookupResult,
} from "@repo/types";
import type { WidgetConfig } from "../config.js";
import type { VisitorDetails } from "../components/PreChatForm.js";
import type { VisitorMediaSend } from "../components/ChatPanel.js";
import { ApiError, apiFetch } from "../lib/api.js";
import { keepConnected } from "../lib/socket.js";
import { notifyInBackground } from "../lib/push.js";
import { uploadVisitorAttachment } from "../lib/media.js";
import { useTypingIndicator, useTypingSignal } from "./useTyping.js";
import {
  clearStoredConversationId,
  clearStoredPhone,
  getSavedVisitor,
  getStoredPhone,
  getVisitorId,
  storeConversationId,
  storePhone,
  storeSavedVisitor,
  type SavedVisitor,
} from "../lib/storage.js";

/**
 * The widget is a small chat app, not a single conversation, so it has screens
 * rather than states: the number they are known by, the list of their chats,
 * and one chat open.
 *
 * `unavailable` is a first-class screen, not an error: nobody being online is a
 * normal answer that the visitor needs stated plainly.
 */
export type ChatPhase =
  "loading" | "identify" | "list" | "form" | "starting" | "unavailable" | "chatting" | "failed";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * A line in the transcript that nobody said.
 *
 * Only ever "you are now talking to this person": when a chat is picked back up
 * after being away, and when it is handed to somebody else mid-conversation. It
 * marks the point in the history where that became true, which is why it sits
 * between the messages rather than in the header.
 *
 * Not stored anywhere — the server keeps messages, and this is not one. It
 * describes this visit, and a visit is what it should last.
 */
export interface ChatNotice {
  id: string;
  agentName: string;
  /** Where it belongs in the transcript. */
  at: string;
}

export interface ChatController {
  phase: ChatPhase;
  branches: Branch[];
  /** The number this browser is identified by, once given. */
  phone: string | null;
  /** Every chat this person has, newest activity first. */
  conversations: VisitorConversationSummary[];
  /** The one they have open, if any. */
  conversation: ConversationWithAgent | null;
  /** The agent whose personal link this is, once loaded. */
  linkAgent: PublicAgentProfile | null;
  /** The branch fixed by an agent or branch link; the visitor isn't asked. */
  lockedBranch: Branch | null;
  messages: Message[];
  /** "Connected with ..." lines, shown in among the messages. */
  notices: ChatNotice[];
  error: string | null;
  /** False while the socket is reconnecting; the composer disables itself. */
  connected: boolean;
  isClosed: boolean;
  /** True while the assigned agent is composing a reply. */
  agentTyping: boolean;
  /** True while their list is being fetched, so the screen can say so. */
  busy: boolean;
  /** Hands over the number their chats are found by. */
  identify: (phone: string) => Promise<void>;
  /** Forgets the number, for handing the device to somebody else. */
  signOut: () => void;
  /**
   * Opens their chat with one agent. Everything they have ever said to that
   * person is one thread, however many conversations it is made of.
   */
  open: (agentId: string) => Promise<void>;
  /** Back to the list, which is refreshed on the way. */
  back: () => void;
  /** Starts a chat: with the agent whose link this is, or with whoever is free. */
  startNew: () => void;
  /**
   * Opens a chat with one named agent, starting it if there is none — what a
   * colleague's link shared into a conversation does.
   */
  openAgent: (agentId: string) => Promise<void>;
  startChat: (visitor: VisitorDetails) => Promise<void>;
  sendMessage: (content: string, replyToId?: string) => Promise<void>;
  /** Adds, replaces or removes this visitor's reaction; null takes it back. */
  react: (messageId: string, emoji: string | null) => void;
  /** This browser's visitor id, which a push subscription is filed under. */
  visitorId: string;
  /** What they told us last time, so the form is never asked for twice. */
  savedVisitor: SavedVisitor | null;
  /** Uploads a photo, video, audio file or voice note, then sends it. */
  sendMedia: (media: VisitorMediaSend) => Promise<void>;
  /** Called on every keystroke; throttled internally. */
  notifyTyping: () => void;
  startOver: () => void;
}

/** Newest activity first, the way any chat list is ordered. */
const byRecency = (rows: VisitorConversationSummary[]): VisitorConversationSummary[] =>
  [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

/**
 * `visible` is whether the chat panel is open. Only then, with the tab in front,
 * does the visitor count as having seen the agent's messages.
 */
export function useChat(config: WidgetConfig, visible: boolean): ChatController {
  const visitorId = useMemo(() => getVisitorId(), []);
  const [phase, setPhase] = useState<ChatPhase>("loading");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [phone, setPhone] = useState<string | null>(() => getStoredPhone());
  const [conversations, setConversations] = useState<VisitorConversationSummary[]>([]);
  const [conversation, setConversation] = useState<ConversationWithAgent | null>(null);
  const [linkAgent, setLinkAgent] = useState<PublicAgentProfile | null>(null);
  const [notices, setNotices] = useState<ChatNotice[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * Marks the transcript with who is answering from here on.
   *
   * Repeating the same name is skipped: a dropped connection or a reopened
   * panel is not a change of person, and saying so twice would read as one.
   */
  const noteConnected = useCallback((agentName: string) => {
    setNotices((current) => {
      if (current[current.length - 1]?.agentName === agentName) return current;
      const at = new Date().toISOString();
      return [...current, { id: `notice-${at}-${current.length}`, agentName, at }];
    });
  }, []);

  const [savedVisitor, setSavedVisitor] = useState<SavedVisitor | null>(() => getSavedVisitor());
  /** Read inside socket handlers, which must not close over changing state. */
  const agentNameRef = useRef<string | null>(null);
  const [lockedBranch, setLockedBranch] = useState<Branch | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // Immediate feedback: the browser knows the network dropped long before the
  // socket misses a heartbeat.
  const [networkUp, setNetworkUp] = useState(true);

  const socketRef = useRef<ClientSocket | null>(null);
  /** The conversation new messages are sent to: their live one with this agent. */
  const conversationId = conversation?.id ?? null;
  /**
   * Every conversation making up the thread on screen.
   *
   * One agent can be several conversations — an earlier one they closed, and a
   * live one — and the visitor is shown them as the single thread they
   * experienced. Socket handlers read this to know whether an event belongs to
   * what is on screen.
   */
  const openIdsRef = useRef<Set<string>>(new Set());
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  /** The newest agent message already reported read, so each is reported once. */
  const reportedReadRef = useRef<string | null>(null);

  const { isTyping: agentTyping, setTyping: setAgentTyping } = useTypingIndicator();

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      const socket = socketRef.current;
      if (socket && conversationId) socket.emit("typing", { conversationId, isTyping });
    },
    [conversationId],
  );
  const { onActivity: notifyTyping, stop: stopTyping } = useTypingSignal(emitTyping);

  useEffect(() => {
    setNetworkUp(navigator.onLine);
    const up = () => setNetworkUp(true);
    const down = () => setNetworkUp(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const appendMessage = useCallback((message: Message) => {
    // The sender receives its own message back through the room broadcast, so
    // de-duplicate on id rather than tracking which ones we sent.
    setMessages((current) =>
      current.some((existing) => existing.id === message.id) ? current : [...current, message],
    );
  }, []);

  /* --------------------------------- their chats -------------------------------- */

  /**
   * Fetches the chats belonging to a number.
   *
   * The same call identifies this browser as that person, which is what lets it
   * open chats started on another device — so it is also how a returning
   * visitor is recognised without being asked anything again.
   */
  const fetchList = useCallback(
    async (forPhone: string): Promise<VisitorLookupResult> => {
      const result = await apiFetch<VisitorLookupResult>(
        config.apiUrl,
        "/api/conversations/lookup",
        {
          method: "POST",
          body: JSON.stringify({
            phone: forPhone,
            visitorId,
            ...(config.agentId ? { agentId: config.agentId } : {}),
            ...(config.branchId ? { branchId: config.branchId } : {}),
          }),
        },
      );
      setConversations(byRecency(result.conversations));

      // We already know this person. Their details fill the form in rather than
      // being asked for again on a device that has never seen them — the
      // number was enough to recognise them.
      const known = result.visitor;
      const status = known?.maritalStatus;
      const city = known?.city;
      if (known && status && city) {
        const remembered: SavedVisitor = {
          name: known.name,
          phone: known.phone,
          maritalStatus: status,
          city,
        };
        setSavedVisitor((current) => current ?? remembered);
      }
      return result;
    },
    [config.apiUrl, config.agentId, config.branchId, visitorId],
  );

  /**
   * Puts one agent's thread on screen.
   *
   * `ids` are every conversation the visitor has had with that person, oldest
   * first. Their messages are merged into one transcript, because that is what
   * the visitor remembers having — one conversation with one agent — whatever
   * the chats were closed and reopened along the way. Replies go to the live
   * one, which is the last of them.
   */
  const openThread = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setError(null);
      setBusy(true);
      try {
        const details = await Promise.all(
          ids.map((id) =>
            apiFetch<ConversationDetail>(
              config.apiUrl,
              `/api/conversations/${id}?visitorId=${encodeURIComponent(visitorId)}`,
            ),
          ),
        );

        // The one still open takes the replies; with none open it is the most
        // recent, so the composer can still say the chat has ended.
        const live =
          details.find((detail) => detail.status === "ACTIVE") ?? details[details.length - 1]!;
        const history = details
          .flatMap((detail) => detail.messages)
          .sort((a, b) =>
            a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
          );

        const { messages: _drop, ...rest } = live;
        openIdsRef.current = new Set(ids);
        setConversation(rest);
        setMessages(history);
        setNotices([]);
        // Only where there is something to come back to. A chat with nothing in
        // it yet already says who is there, above the empty canvas.
        if (history.length > 0) noteConnected(live.agent.name);
        storeConversationId(live.id);
        // Opening it is reading it; the badge goes now rather than after the
        // receipt has made its way back.
        setConversations((current) =>
          current.map((row) => (ids.includes(row.id) ? { ...row, unreadCount: 0 } : row)),
        );
        setPhase("chatting");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not open that chat");
        setPhase("list");
      } finally {
        setBusy(false);
      }
    },
    [config.apiUrl, visitorId, noteConnected],
  );

  /** Every conversation with one agent, oldest first. */
  const threadFor = useCallback(
    (agentId: string, rows: VisitorConversationSummary[]): string[] =>
      rows
        .filter((row) => row.agent.id === agentId)
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map((row) => row.id),
    [],
  );

  /**
   * Where to land once we know who they are.
   *
   * An agent's link is a request to talk to that person: their chat opens
   * straight away if there is one, and the back button is what turns it back
   * into the list. Everyone else lands on the list, or on the form when the
   * number is new to us.
   */
  const settle = useCallback(
    async (result: VisitorLookupResult) => {
      if (config.agentId) {
        const theirs = threadFor(config.agentId, result.conversations);
        if (theirs.length > 0) {
          await openThread(theirs);
          return;
        }
      }
      // Nothing to show a list of: they go straight to starting one.
      if (result.conversations.length === 0) {
        setPhase("form");
        return;
      }
      setPhase("list");
    },
    [config.agentId, openThread, threadFor],
  );

  /* ---------------------------------- boot ---------------------------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const list = await apiFetch<Branch[]>(config.apiUrl, "/api/branches");
        if (cancelled) return;
        setBranches(list);

        // A link for one agent or one branch: resolve it up front, so a
        // deactivated agent or branch says so instead of failing at "Start".
        if (config.agentId) {
          try {
            const agent = await apiFetch<PublicAgentProfile>(
              config.apiUrl,
              `/api/agents/${encodeURIComponent(config.agentId)}/public`,
            );
            if (cancelled) return;
            setLinkAgent(agent);
            setLockedBranch(list.find((branch) => branch.id === agent.branch.id) ?? null);
          } catch {
            if (cancelled) return;
            setError("This chat link is no longer active.");
            setPhase("failed");
            return;
          }
        } else if (config.branchId) {
          const branch = list.find((candidate) => candidate.id === config.branchId);
          if (!branch) {
            setError("This chat link is no longer active.");
            setPhase("failed");
            return;
          }
          setLockedBranch(branch);
        }

        const known = getStoredPhone();
        if (!known) {
          setPhase("identify");
          return;
        }

        try {
          const result = await fetchList(known);
          if (cancelled) return;
          await settle(result);
        } catch {
          // The number no longer checks out, or the lookup is unavailable.
          if (!cancelled) setPhase("identify");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load the chat");
        setPhase("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config.apiUrl, config.agentId, config.branchId, fetchList, settle]);

  /* --------------------------------- realtime -------------------------------- */

  /**
   * One socket for the whole session, not one per chat.
   *
   * Every one of their conversations is joined, so a reply from the agent they
   * are not reading still lands on the list as an unread count — which is the
   * point of having a list at all.
   */
  useEffect(() => {
    if (!phone) return;

    const socket: ClientSocket = io(config.apiUrl, {
      auth: { role: "VISITOR", visitorId },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("message:new", (message) => {
      const mine = openIdsRef.current.has(message.conversationId);

      if (message.senderType === "AGENT") {
        if (mine) setAgentTyping(false);
        // Only while the visitor is on another tab; on the hosted page a push
        // covers them once it is closed altogether.
        notifyInBackground(
          agentNameRef.current ?? "New message",
          message.content || "Sent a message",
          `chat-${message.conversationId}`,
        );
      }

      if (mine) appendMessage(message);

      // The list carries its own copy of the last thing said, and the count of
      // what has not been read, for every chat including the open one.
      setConversations((current) =>
        byRecency(
          current.map((row) =>
            row.id === message.conversationId
              ? {
                  ...row,
                  lastMessage: message,
                  updatedAt: message.createdAt,
                  unreadCount:
                    message.senderType === "AGENT" && !mine ? row.unreadCount + 1 : row.unreadCount,
                }
              : row,
          ),
        ),
      );
    });

    // An admin removed a message. Nothing of it is left, so it simply goes.
    socket.on("message:deleted", ({ conversationId: id, messageId }) => {
      if (!openIdsRef.current.has(id)) return;
      setMessages((current) => current.filter((message) => message.id !== messageId));
    });

    socket.on("message:reaction", ({ conversationId: id, messageId, reactions }) => {
      if (!openIdsRef.current.has(id)) return;
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? { ...message, reactions } : message)),
      );
    });

    socket.on("message:receipt", (receipt) => {
      if (!openIdsRef.current.has(receipt.conversationId)) return;
      setMessages((current) => applyReceipt(current, receipt));
    });

    socket.on("typing:update", (payload) => {
      if (openIdsRef.current.has(payload.conversationId) && payload.senderType === "AGENT") {
        setAgentTyping(payload.isTyping);
      }
    });

    socket.on("agent:profile", (profile) => {
      setConversation((current) =>
        current && current.agent.id === profile.agentId
          ? {
              ...current,
              agent: { ...current.agent, name: profile.name, avatarUrl: profile.avatarUrl },
            }
          : current,
      );
      setConversations((current) =>
        current.map((row) =>
          row.agent.id === profile.agentId
            ? { ...row, agent: { ...row.agent, name: profile.name, avatarUrl: profile.avatarUrl } }
            : row,
        ),
      );
    });

    socket.on("conversation:closed", (closed) => {
      setConversation((current) =>
        current && current.id === closed.id
          ? { ...current, status: closed.status, closedAt: closed.closedAt }
          : current,
      );
      setConversations((current) =>
        current.map((row) =>
          row.id === closed.id ? { ...row, status: closed.status, closedAt: closed.closedAt } : row,
        ),
      );
    });

    // An admin handed the chat to another agent. The visitor is not told that
    // happened — only who is answering now, so the header stops showing a name
    // that no longer belongs to this conversation.
    socket.on("conversation:transferred", (transfer) => {
      if (openIdsRef.current.has(transfer.conversationId)) {
        setAgentTyping(false);
        // The one change of person the visitor does see happen.
        noteConnected(transfer.agent.name);
        setConversation((current) =>
          current && current.id === transfer.conversationId
            ? { ...current, agentId: transfer.agent.id, agent: transfer.agent }
            : current,
        );
      }
      setConversations((current) =>
        current.map((row) =>
          row.id === transfer.conversationId
            ? {
                ...row,
                agentId: transfer.agent.id,
                agent: {
                  id: transfer.agent.id,
                  name: transfer.agent.name,
                  isOnline: transfer.agent.isOnline,
                  avatarUrl: transfer.agent.avatarUrl,
                },
                branch: transfer.branch,
              }
            : row,
        ),
      );
    });

    // An admin removed the chat. Unlike closing it, there is no transcript left
    // to read, so it leaves the list rather than sitting there unopenable.
    socket.on("conversation:deleted", (deleted) => {
      setConversations((current) => current.filter((row) => row.id !== deleted.conversationId));
      if (!openIdsRef.current.has(deleted.conversationId)) return;
      clearStoredConversationId();
      setAgentTyping(false);
      setConversation(null);
      setMessages([]);
      setError("That conversation was removed.");
      setPhase("list");
    });

    // A handshake the server refuses is not something Socket.IO retries, and a
    // visitor has no sign-in to redo, so it is retried here.
    const stopRetrying = keepConnected(socket, {
      onRetrying: () => setConnected(false),
      onRejected: () => setConnected(false),
    });

    return () => {
      stopRetrying();
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [phone, config.apiUrl, visitorId, appendMessage, setAgentTyping, noteConnected]);

  /*
   * Room membership follows the list. Rejoined on every reconnect too, because
   * the server forgets which rooms a socket was in when it drops.
   */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;
    for (const row of conversations) {
      socket.emit("conversation:join", { conversationId: row.id });
    }
  }, [conversations, connected]);

  /* --------------------------------- actions -------------------------------- */

  const identify = useCallback(
    async (given: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await fetchList(given);
        storePhone(given);
        setPhone(given);
        await settle(result);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not look that number up");
      } finally {
        setBusy(false);
      }
    },
    [fetchList, settle],
  );

  const signOut = useCallback(() => {
    clearStoredPhone();
    clearStoredConversationId();
    setPhone(null);
    setConversations([]);
    setConversation(null);
    setMessages([]);
    setNotices([]);
    setError(null);
    setPhase("identify");
  }, []);

  const open = useCallback(
    (agentId: string) => openThread(threadFor(agentId, conversations)),
    [openThread, threadFor, conversations],
  );

  const back = useCallback(() => {
    openIdsRef.current = new Set();
    setConversation(null);
    setMessages([]);
    setNotices([]);
    setError(null);
    clearStoredConversationId();
    setPhase("list");
    // Quietly brought up to date: anything said while they were reading another
    // chat is already in, but a closed chat or a hand-over may not be.
    const known = getStoredPhone();
    if (known) void fetchList(known).catch(() => undefined);
  }, [fetchList]);

  /**
   * Starting another chat. Their details are already known by this point in
   * almost every case, so the form is only shown to somebody genuinely new.
   */
  const startNew = useCallback(() => {
    setError(null);
    setPhase("form");
  }, []);

  const startChat = useCallback(
    async (visitor: VisitorDetails) => {
      setPhase("starting");
      setError(null);

      // Remembered before the round trip: even a chat that finds nobody
      // available should not cost them their details a second time.
      storeSavedVisitor(visitor);
      setSavedVisitor(visitor);
      storePhone(visitor.phone);
      setPhone(visitor.phone);

      try {
        const result = await apiFetch<AssignmentResult>(config.apiUrl, "/api/conversations", {
          method: "POST",
          body: JSON.stringify({
            // An agent link wins, then a branch link. A plain widget sends
            // neither and the server routes to the company's main branch.
            ...(config.agentId
              ? { agentId: config.agentId }
              : config.branchId
                ? { branchId: config.branchId }
                : {}),
            visitorId,
            visitor,
          }),
        });

        if (!result.available) {
          setPhase("unavailable");
          setError(result.message);
          return;
        }

        const refreshed = await fetchList(visitor.phone).catch(() => null);
        const thread = refreshed
          ? threadFor(result.conversation.agent.id, refreshed.conversations)
          : [];
        await openThread(thread.length > 0 ? thread : [result.conversation.id]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not start the chat");
        setPhase("failed");
      }
    },
    [config.apiUrl, config.agentId, config.branchId, visitorId, fetchList, openThread, threadFor],
  );

  /**
   * The chat with one named agent, whether or not it exists yet.
   *
   * An agent can hand a visitor on by sending a colleague's link; tapping it
   * should land them in that conversation rather than in a form. Their details
   * are already known by then — they are mid-chat — so nothing is asked again.
   */
  const openAgent = useCallback(
    async (agentId: string) => {
      const existing = threadFor(agentId, conversations);
      if (existing.length > 0) {
        await openThread(existing);
        return;
      }

      const details = savedVisitor;
      if (!details) {
        // Nothing to start one with. The form knows what to ask for.
        setPhase("form");
        return;
      }

      setPhase("starting");
      setError(null);
      try {
        const result = await apiFetch<AssignmentResult>(config.apiUrl, "/api/conversations", {
          method: "POST",
          body: JSON.stringify({ agentId, visitorId, visitor: details }),
        });
        if (!result.available) {
          setPhase("unavailable");
          setError(result.message);
          return;
        }
        const refreshed = await fetchList(details.phone).catch(() => null);
        const thread = refreshed ? threadFor(agentId, refreshed.conversations) : [];
        await openThread(thread.length > 0 ? thread : [result.conversation.id]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not open that chat");
        setPhase("list");
      }
    },
    [conversations, threadFor, openThread, savedVisitor, config.apiUrl, visitorId, fetchList],
  );

  const sendMessage = useCallback(
    (content: string, replyToId?: string) =>
      new Promise<void>((resolve) => {
        const socket = socketRef.current;
        if (!socket || !conversationId) {
          setError("Not connected");
          resolve();
          return;
        }

        setError(null);
        stopTyping();
        socket.emit("message:send", { conversationId, content, replyToId }, (result) => {
          if (!result.ok) setError(result.message);
          resolve();
        });
      }),
    [conversationId, stopTyping],
  );

  const sendMedia = useCallback(
    async (media: VisitorMediaSend) => {
      const socket = socketRef.current;
      if (!socket?.connected || !conversationId) throw new Error("Not connected");
      setError(null);

      const uploadToken = await uploadVisitorAttachment({
        apiUrl: config.apiUrl,
        conversationId,
        visitorId,
        kind: media.kind,
        file: media.file,
        fileName: media.fileName,
        onProgress: media.onProgress,
      });

      await new Promise<void>((resolve, reject) => {
        socket.emit(
          "message:send",
          {
            conversationId,
            content: media.caption,
            replyToId: media.replyToId,
            attachment: {
              uploadToken,
              durationMs: media.durationMs,
              waveform: media.waveform,
            },
          },
          (result) => (result.ok ? resolve() : reject(new Error(result.message))),
        );
      });
      stopTyping();
    },
    [config.apiUrl, conversationId, visitorId, stopTyping],
  );

  const react = useCallback(
    (messageId: string, emoji: string | null) => {
      const socket = socketRef.current;
      if (!socket || !conversationId) return;
      // The broadcast is what updates the screen, so nothing is done here with
      // the acknowledgement beyond reporting a refusal.
      socket.emit("message:react", { conversationId, messageId, emoji }, (result) => {
        if (!result.ok) setError(result.message);
      });
    },
    [conversationId],
  );

  useEffect(() => {
    agentNameRef.current = conversation?.agent.name ?? linkAgent?.name ?? null;
  }, [conversation, linkAgent]);

  /** What the "start a new chat" button does once a chat has ended. */
  const startOver = useCallback(() => {
    setConversation(null);
    setMessages([]);
    setNotices([]);
    setError(null);
    clearStoredConversationId();
    setPhase(savedVisitor ? "form" : "identify");
  }, [savedVisitor]);

  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Blue ticks: tell the server once the agent's latest message is actually on
  // screen, meaning the panel is open and the tab is in front.
  useEffect(() => {
    if (!visible || !pageVisible || !conversationId) return;
    let unread: Message | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      if (message.senderType === "AGENT" && !message.readAt) {
        unread = message;
        break;
      }
    }
    if (!unread || reportedReadRef.current === unread.id) return;
    reportedReadRef.current = unread.id;
    // Buffered by socket.io while reconnecting, so it isn't lost.
    socketRef.current?.emit("conversation:read", { conversationId });
  }, [visible, pageVisible, conversationId, messages, connected]);

  return {
    phase,
    branches,
    phone,
    conversations,
    conversation,
    linkAgent,
    lockedBranch,
    messages,
    notices,
    error,
    connected: connected && networkUp,
    isClosed: conversation?.status === "CLOSED",
    agentTyping,
    busy,
    identify,
    signOut,
    open,
    back,
    startNew,
    openAgent,
    startChat,
    sendMessage,
    sendMedia,
    react,
    visitorId,
    savedVisitor,
    notifyTyping,
    startOver,
  };
}
