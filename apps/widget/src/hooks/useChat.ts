import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AssignmentResult,
  Branch,
  ClientToServerEvents,
  ConversationDetail,
  ConversationWithAgent,
  Message,
  ServerToClientEvents,
} from "@repo/types";
import type { WidgetConfig } from "../config.js";
import type { VisitorDetails } from "../components/PreChatForm.js";
import { ApiError, apiFetch } from "../lib/api.js";
import { useTypingIndicator, useTypingSignal } from "./useTyping.js";
import {
  clearStoredConversationId,
  getStoredConversationId,
  getVisitorId,
  storeConversationId,
} from "../lib/storage.js";

/**
 * `unavailable` is a first-class phase, not an error: nobody being online is a
 * normal answer that the visitor needs stated plainly.
 */
export type ChatPhase = "loading" | "picking" | "starting" | "unavailable" | "chatting" | "failed";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface ChatController {
  phase: ChatPhase;
  branches: Branch[];
  conversation: ConversationWithAgent | null;
  messages: Message[];
  error: string | null;
  /** False while the socket is reconnecting; the composer disables itself. */
  connected: boolean;
  isClosed: boolean;
  /** True while the assigned agent is composing a reply. */
  agentTyping: boolean;
  startChat: (branchId: string, visitor: VisitorDetails) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  /** Called on every keystroke; throttled internally. */
  notifyTyping: () => void;
  startOver: () => void;
}

export function useChat(config: WidgetConfig): ChatController {
  const visitorId = useMemo(() => getVisitorId(), []);
  const [phase, setPhase] = useState<ChatPhase>("loading");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [conversation, setConversation] = useState<ConversationWithAgent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // Immediate feedback: the browser knows the network dropped long before the
  // socket misses a heartbeat.
  const [networkUp, setNetworkUp] = useState(true);

  const socketRef = useRef<ClientSocket | null>(null);
  const conversationId = conversation?.id ?? null;

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

  // Load branches, and resume an open conversation if this browser has one.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const list = await apiFetch<Branch[]>(config.apiUrl, "/api/branches");
        if (cancelled) return;
        setBranches(list);

        const storedId = getStoredConversationId();
        if (!storedId) {
          setPhase("picking");
          return;
        }

        try {
          const detail = await apiFetch<ConversationDetail>(
            config.apiUrl,
            `/api/conversations/${storedId}?visitorId=${encodeURIComponent(visitorId)}`,
          );
          if (cancelled) return;

          if (detail.status === "CLOSED") {
            // A finished chat should not reopen on the next page view.
            clearStoredConversationId();
            setPhase("picking");
            return;
          }

          const { messages: history, ...rest } = detail;
          setConversation(rest);
          setMessages(history);
          setPhase("chatting");
        } catch {
          // The stored id is stale or no longer ours — start fresh.
          clearStoredConversationId();
          if (!cancelled) setPhase("picking");
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
  }, [config.apiUrl, visitorId]);

  // One socket per conversation. Keyed on the id so a status change (for
  // example the agent closing the chat) does not force a reconnect.
  useEffect(() => {
    if (!conversationId) return;

    const socket: ClientSocket = io(config.apiUrl, {
      auth: { role: "VISITOR", visitorId },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("conversation:join", { conversationId });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("message:new", (message) => {
      // Their message arriving means they have stopped typing.
      if (message.senderType === "AGENT") setAgentTyping(false);
      appendMessage(message);
    });
    socket.on("typing:update", (payload) => {
      if (payload.conversationId === conversationId && payload.senderType === "AGENT") {
        setAgentTyping(payload.isTyping);
      }
    });
    socket.on("conversation:closed", (closed) => {
      setConversation((current) =>
        current && current.id === closed.id
          ? { ...current, status: closed.status, closedAt: closed.closedAt }
          : current,
      );
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [conversationId, config.apiUrl, visitorId, appendMessage, setAgentTyping]);

  const startChat = useCallback(
    async (branchId: string, visitor: VisitorDetails) => {
      setPhase("starting");
      setError(null);

      try {
        const result = await apiFetch<AssignmentResult>(config.apiUrl, "/api/conversations", {
          method: "POST",
          body: JSON.stringify({ branchId, visitorId, visitor }),
        });

        if (!result.available) {
          setPhase("unavailable");
          setError(result.message);
          return;
        }

        storeConversationId(result.conversation.id);
        setConversation(result.conversation);

        const detail = await apiFetch<ConversationDetail>(
          config.apiUrl,
          `/api/conversations/${result.conversation.id}?visitorId=${encodeURIComponent(visitorId)}`,
        );
        setMessages(detail.messages);
        setPhase("chatting");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not start the chat");
        setPhase("failed");
      }
    },
    [config.apiUrl, visitorId],
  );

  const sendMessage = useCallback(
    (content: string) =>
      new Promise<void>((resolve) => {
        const socket = socketRef.current;
        if (!socket || !conversationId) {
          setError("Not connected");
          resolve();
          return;
        }

        setError(null);
        stopTyping();
        socket.emit("message:send", { conversationId, content }, (result) => {
          if (!result.ok) setError(result.message);
          resolve();
        });
      }),
    [conversationId, stopTyping],
  );

  const startOver = useCallback(() => {
    clearStoredConversationId();
    setConversation(null);
    setMessages([]);
    setError(null);
    setPhase("picking");
  }, []);

  return {
    phase,
    branches,
    conversation,
    messages,
    error,
    connected: connected && networkUp,
    isClosed: conversation?.status === "CLOSED",
    agentTyping,
    startChat,
    sendMessage,
    notifyTyping,
    startOver,
  };
}
