"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Agent,
  ClientToServerEvents,
  ConversationDetail,
  ConversationSummary,
  Message,
  ServerToClientEvents,
} from "@repo/types";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useTypingSignal } from "@/hooks/useTyping";
import {
  loadOutbox,
  newClientId,
  saveOutbox,
  type QueuedMessage,
} from "@/lib/outbox";
import { TYPING } from "@repo/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Inbox {
  conversations: ConversationSummary[];
  selectedId: string | null;
  detail: ConversationDetail | null;
  loading: boolean;
  connected: boolean;
  error: string | null;
  select: (conversationId: string) => void;
  send: (content: string) => Promise<void>;
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

export function useInbox(agentId: string, token: string): Inbox {
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

  const loadConversations = useCallback(async () => {
    const rows = await api<ConversationSummary[]>(
      `/api/agents/${agentId}/conversations?status=ACTIVE`,
      { token },
    );
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
          joinAll(rows.map((row) => row.id));

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
      setConversations((current) =>
        current.some((row) => row.id === conversation.id)
          ? current
          : [{ ...conversation, lastMessage: null, messageCount: 0 }, ...current],
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

        const updated = {
          ...row,
          lastMessage: message,
          messageCount: row.messageCount + 1,
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

    socket.on("conversation:closed", (conversation) => {
      setVisitorTyping(conversation.id, false);
      setConversations((current) => current.filter((row) => row.id !== conversation.id));
      setDetail((current) =>
        current && current.id === conversation.id
          ? { ...current, status: conversation.status, closedAt: conversation.closedAt }
          : current,
      );
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, loadConversations, setVisitorTyping, updateOutbox]);

  const select = useCallback(
    (conversationId: string) => {
      setSelectedId(conversationId);
      setDetail(null);
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
    (content: string) =>
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
          { conversationId, content, clientId: queued.clientId },
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
    close,
    setOnline,
    typingIn,
    notifyTyping,
    pending: selectedId ? outbox.filter((m) => m.conversationId === selectedId) : [],
    pendingCount: outbox.length,
  };
}
