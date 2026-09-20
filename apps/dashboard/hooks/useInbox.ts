"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Agent,
  AgentProfilePayload,
  ClientToServerEvents,
  ConversationDetail,
  ConversationSummary,
  Message,
  MessageQuote,
  ServerToClientEvents,
} from "@repo/types";
import type { MediaSend } from "@/components/ConversationView";
import { api } from "@/lib/api";
import { uploadAttachment } from "@/lib/media";
import { API_URL } from "@/lib/config";
import { useTypingSignal } from "@/hooks/useTyping";
import { loadOutbox, newClientId, saveOutbox, type QueuedMessage } from "@/lib/outbox";
import { playChime } from "@/lib/sound";
import { notifyInBackground } from "@/lib/push";
import { TYPING, applyReceipt } from "@repo/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Inbox {
  conversations: ConversationSummary[];
  selectedId: string | null;
  detail: ConversationDetail | null;
  loading: boolean;
  connected: boolean;
  error: string | null;
  select: (conversationId: string) => void;
  send: (content: string, replyTo?: MessageQuote | null) => Promise<void>;
  /** Adds, replaces or removes this agent's reaction; null takes it back. */
  react: (messageId: string, emoji: string | null) => void;
  /** Uploads a file or voice note, then sends it. Needs a live connection. */
  sendMedia: (media: MediaSend) => Promise<void>;
  close: (conversationId: string) => Promise<void>;
  setOnline: (isOnline: boolean) => Promise<Agent>;
  /** Conversation ids where the visitor is currently typing. */
  typingIn: Record<string, boolean>;
  /** Called on every keystroke; throttled internally. */
  notifyTyping: () => void;
  /** Sent but not yet confirmed by the server, for the open conversation. */
  pending: QueuedMessage[];
  /** How many messages are waiting to go out across all conversations. */
  pendingCount: number;
}

export function useInbox(
  agentId: string,
  token: string,
  /** An admin changed this agent's name or photo from their dashboard. */
  onProfile?: (profile: AgentProfilePayload) => void,
): Inbox {
  const [pageVisible, setPageVisible] = useState(true);
  /** The newest visitor message already reported read, so each is reported once. */
  const reportedReadRef = useRef<string | null>(null);
  const onProfileRef = useRef(onProfile);
  useEffect(() => {
    onProfileRef.current = onProfile;
  });
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  // The socket only learns it is dead when a heartbeat is missed. The browser
  // knows the moment the network drops, so use it for immediate feedback.
  const [networkUp, setNetworkUp] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typingIn, setTypingIn] = useState<Record<string, boolean>>({});
  // Restored from localStorage so a reload mid-outage keeps unsent messages.
  const [outbox, setOutbox] = useState<QueuedMessage[]>([]);
  const outboxRef = useRef<QueuedMessage[]>([]);

  const updateOutbox = useCallback((next: QueuedMessage[]) => {
    outboxRef.current = next;
    setOutbox(next);
    saveOutbox(next);
  }, []);

  useEffect(() => {
    const restored = loadOutbox();
    outboxRef.current = restored;
    setOutbox(restored);
  }, []);

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

  const socketRef = useRef<ClientSocket | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  // One expiry timer per conversation, so a visitor who closes their tab stops
  // showing as typing without needing any message from them.
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const setVisitorTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const timers = typingTimers.current;
    const existing = timers.get(conversationId);
    if (existing) clearTimeout(existing);
    timers.delete(conversationId);

    setTypingIn((current) => {
      if (Boolean(current[conversationId]) === isTyping) return current;
      const next = { ...current };
      if (isTyping) next[conversationId] = true;
      else delete next[conversationId];
      return next;
    });

    if (isTyping) {
      timers.set(
        conversationId,
        setTimeout(() => setVisitorTyping(conversationId, false), TYPING.EXPIRY_MS),
      );
    }
  }, []);

  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = socketRef.current;
    const conversationId = selectedIdRef.current;
    if (socket && conversationId) socket.emit("typing", { conversationId, isTyping });
  }, []);
  const { onActivity: notifyTyping, stop: stopTyping } = useTypingSignal(emitTyping);

  // Open and closed together: closed chats stay readable in the inbox's
  // "Closed" tab, the way a chat app keeps old threads.
  const loadConversations = useCallback(async () => {
    const rows = await api<ConversationSummary[]>(`/api/agents/${agentId}/conversations`, {
      token,
    });
    setConversations(rows);
    return rows;
  }, [agentId, token]);

  // One socket for the whole session. The agent room is joined automatically by
  // the server; conversation rooms are joined here so inbox previews stay live
  // even for chats that are not currently open.
  useEffect(() => {
    const socket: ClientSocket = io(API_URL, {
      auth: { role: "AGENT", token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const joinAll = (ids: string[]) => {
      for (const id of ids) socket.emit("conversation:join", { conversationId: id });
    };

    /** Send one queued message; drop it from the queue once stored. */
    const flushOne = (queued: QueuedMessage) =>
      new Promise<void>((resolve) => {
        socket.emit(
          "message:send",
          {
            conversationId: queued.conversationId,
            content: queued.content,
            clientId: queued.clientId,
            replyToId: queued.replyTo?.id,
          },
          (result) => {
            if (result.ok) {
              updateOutbox(outboxRef.current.filter((m) => m.clientId !== queued.clientId));
            } else {
              // A permanent rejection (closed chat, lost access) would otherwise
              // be retried on every reconnect forever.
              updateOutbox(outboxRef.current.filter((m) => m.clientId !== queued.clientId));
              setError(result.message);
            }
            resolve();
          },
        );
      });

    socket.on("connect", () => {
      setConnected(true);

      // Refetch rather than trust what is on screen: anything said during the
      // outage was never broadcast to this socket.
      void loadConversations()
        .then(async (rows) => {
          // Only open chats can still change, so only their rooms are worth joining.
          joinAll(rows.filter((row) => row.status === "ACTIVE").map((row) => row.id));

          const openId = selectedIdRef.current;
          if (openId) {
            const fresh = await api<ConversationDetail>(`/api/conversations/${openId}`, { token });
            setDetail(fresh);
          }

          // Only after the rooms are joined, so the echo of each flushed
          // message comes back and replaces its pending bubble.
          for (const queued of [...outboxRef.current]) await flushOne(queued);
        })
        .catch(() => setError("Could not load conversations"))
        .finally(() => setLoading(false));
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("conversation:assigned", (conversation) => {
      socket.emit("conversation:join", { conversationId: conversation.id });
      // A visitor is waiting: worth hearing even with the inbox in view.
      playChime("newChat");
      notifyInBackground(
        "New chat",
        `${conversation.visitor.name} started a conversation`,
        `chat-${conversation.id}`,
      );
      setConversations((current) =>
        current.some((row) => row.id === conversation.id)
          ? current
          : [{ ...conversation, lastMessage: null, messageCount: 0, unreadCount: 0 }, ...current],
      );
    });

    socket.on("typing:update", (payload) => {
      if (payload.senderType === "VISITOR") {
        setVisitorTyping(payload.conversationId, payload.isTyping);
      }
    });

    socket.on("message:new", (message: Message) => {
      // Their message arriving means they have stopped typing.
      if (message.senderType === "VISITOR") setVisitorTyping(message.conversationId, false);

      // Only the visitor's messages chime, and only when the agent is not
      // already reading that conversation on screen: an answer they are
      // watching arrive does not need announcing.
      if (
        message.senderType === "VISITOR" &&
        (document.hidden || message.conversationId !== selectedIdRef.current)
      ) {
        playChime("message");
        // Only fires while the tab is hidden; the server pushes when it is
        // closed, and the two cannot both happen.
        notifyInBackground(
          "New message",
          message.content || "Sent a message",
          `chat-${message.conversationId}`,
        );
      }

      // Our own message coming back through the room retires its pending copy.
      if (message.clientId) {
        const remaining = outboxRef.current.filter((m) => m.clientId !== message.clientId);
        if (remaining.length !== outboxRef.current.length) updateOutbox(remaining);
      }
      // Update the preview for whichever conversation it belongs to, and move
      // that conversation to the top, matching the server's ordering.
      setConversations((current) => {
        const index = current.findIndex((row) => row.id === message.conversationId);
        if (index === -1) return current;
        const row = current[index];
        if (!row) return current;

        // Read where the agent is looking at this chat with the page in
        // front of them; the read receipt goes out in the same breath.
        const seen =
          message.senderType === "AGENT" ||
          (message.conversationId === selectedIdRef.current && !document.hidden);

        const updated = {
          ...row,
          lastMessage: message,
          messageCount: row.messageCount + 1,
          unreadCount: seen ? 0 : row.unreadCount + 1,
          updatedAt: message.createdAt,
        };
        return [updated, ...current.filter((_, i) => i !== index)];
      });

      if (message.conversationId === selectedIdRef.current) {
        setDetail((current) =>
          current && !current.messages.some((existing) => existing.id === message.id)
            ? { ...current, messages: [...current.messages, message] }
            : current,
        );
      }
    });

    socket.on("message:reaction", ({ conversationId, messageId, reactions }) => {
      setConversations((current) =>
        current.map((row) =>
          row.id === conversationId && row.lastMessage?.id === messageId
            ? { ...row, lastMessage: { ...row.lastMessage, reactions } }
            : row,
        ),
      );
      setDetail((current) =>
        current?.id === conversationId
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === messageId ? { ...message, reactions } : message,
              ),
            }
          : current,
      );
    });

    socket.on("message:receipt", (receipt) => {
      setConversations((current) =>
        current.map((row) =>
          row.id === receipt.conversationId && row.lastMessage
            ? { ...row, lastMessage: applyReceipt([row.lastMessage], receipt)[0]! }
            : row,
        ),
      );
      setDetail((current) =>
        current && current.id === receipt.conversationId
          ? { ...current, messages: applyReceipt(current.messages, receipt) }
          : current,
      );
    });

    socket.on("agent:profile", (profile) => {
      if (profile.agentId === agentId) onProfileRef.current?.(profile);
    });

    socket.on("conversation:closed", (conversation) => {
      setVisitorTyping(conversation.id, false);
      // Kept, not removed: it moves from the Open tab to Closed.
      setConversations((current) =>
        current.map((row) =>
          row.id === conversation.id
            ? { ...row, status: conversation.status, closedAt: conversation.closedAt }
            : row,
        ),
      );
      setDetail((current) =>
        current && current.id === conversation.id
          ? { ...current, status: conversation.status, closedAt: conversation.closedAt }
          : current,
      );
    });

    // An admin deleted the chat. Unlike closing, nothing of it is left to read,
    // so the row goes rather than moving to the Closed tab.
    socket.on("conversation:deleted", ({ conversationId }) => {
      setVisitorTyping(conversationId, false);
      socket.emit("conversation:leave", { conversationId });
      setConversations((current) => current.filter((row) => row.id !== conversationId));
      // Anything still queued for it can never be delivered now.
      updateOutbox(outboxRef.current.filter((m) => m.conversationId !== conversationId));
      if (conversationId === selectedIdRef.current) {
        setSelectedId(null);
        setDetail(null);
        setError("That conversation was deleted by an administrator.");
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [agentId, token, loadConversations, setVisitorTyping, updateOutbox]);

  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Blue ticks for the visitor: the open conversation is on screen and the tab
  // is in front, so everything they said so far has been seen.
  useEffect(() => {
    if (!detail || !pageVisible) return;
    let unread: Message | undefined;
    for (let i = detail.messages.length - 1; i >= 0; i--) {
      const message = detail.messages[i]!;
      if (message.senderType === "VISITOR" && !message.readAt) {
        unread = message;
        break;
      }
    }
    if (!unread || reportedReadRef.current === unread.id) return;
    reportedReadRef.current = unread.id;
    socketRef.current?.emit("conversation:read", { conversationId: detail.id });
    setConversations((current) =>
      current.map((row) => (row.id === detail.id ? { ...row, unreadCount: 0 } : row)),
    );
  }, [detail, pageVisible]);

  const select = useCallback(
    (conversationId: string) => {
      setSelectedId(conversationId);
      setDetail(null);
      setConversations((current) =>
        current.map((row) => (row.id === conversationId ? { ...row, unreadCount: 0 } : row)),
      );
      void api<ConversationDetail>(`/api/conversations/${conversationId}`, { token })
        .then(setDetail)
        .catch(() => setError("Could not open that conversation"));
    },
    [token],
  );

  /**
   * Queue first, then attempt. The message is durable from the moment the agent
   * hits send, so losing the connection — or the tab — cannot lose their words.
   */
  const send = useCallback(
    (content: string, replyTo?: MessageQuote | null) =>
      new Promise<void>((resolve) => {
        const conversationId = selectedIdRef.current;
        if (!conversationId) {
          setError("No conversation is open");
          resolve();
          return;
        }

        const queued: QueuedMessage = {
          clientId: newClientId(),
          conversationId,
          content,
          replyTo: replyTo ?? null,
          createdAt: new Date().toISOString(),
        };
        updateOutbox([...outboxRef.current, queued]);

        setError(null);
        stopTyping();

        const socket = socketRef.current;
        if (!socket?.connected) {
          // Stays queued; the reconnect handler will send it.
          resolve();
          return;
        }

        socket.emit(
          "message:send",
          { conversationId, content, clientId: queued.clientId, replyToId: replyTo?.id },
          (result) => {
            if (result.ok) {
              updateOutbox(outboxRef.current.filter((m) => m.clientId !== queued.clientId));
            } else {
              updateOutbox(outboxRef.current.filter((m) => m.clientId !== queued.clientId));
              setError(result.message);
            }
            resolve();
          },
        );
      }),
    [stopTyping, updateOutbox],
  );

  /**
   * Media is not queued offline the way text is: the upload itself needs the
   * network, so it runs now and failures surface in the composer.
   */
  const react = useCallback((messageId: string, emoji: string | null) => {
    const conversationId = selectedIdRef.current;
    const socket = socketRef.current;
    if (!conversationId || !socket?.connected) return;
    // The broadcast is what updates the screen; only a refusal is handled here.
    socket.emit("message:react", { conversationId, messageId, emoji }, (result) => {
      if (!result.ok) setError(result.message);
    });
  }, []);

  const sendMedia = useCallback(
    async (media: MediaSend) => {
      const conversationId = selectedIdRef.current;
      const socket = socketRef.current;
      if (!conversationId) throw new Error("No conversation is open");
      if (!socket?.connected) throw new Error("You're offline. Media sends once you reconnect.");

      const uploadToken = await uploadAttachment({
        conversationId,
        token,
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
    [token, stopTyping],
  );

  const close = useCallback(
    async (conversationId: string) => {
      await api(`/api/conversations/${conversationId}/close`, { method: "POST", token });
      // The `conversation:closed` broadcast updates the list; nothing to do here.
    },
    [token],
  );

  const setOnline = useCallback(
    (isOnline: boolean) =>
      api<Agent>(`/api/agents/${agentId}/status`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isOnline }),
      }),
    [agentId, token],
  );

  return {
    conversations,
    selectedId,
    detail,
    loading,
    connected: connected && networkUp,
    error,
    select,
    send,
    sendMedia,
    react,
    close,
    setOnline,
    typingIn,
    notifyTyping,
    pending: selectedId ? outbox.filter((m) => m.conversationId === selectedId) : [],
    pendingCount: outbox.length,
  };
}
