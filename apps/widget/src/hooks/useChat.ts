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
} from "@repo/types";
import type { WidgetConfig } from "../config.js";
import type { VisitorDetails } from "../components/PreChatForm.js";
import type { VisitorMediaSend } from "../components/ChatPanel.js";
import { ApiError, apiFetch } from "../lib/api.js";
import { uploadVisitorAttachment } from "../lib/media.js";
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
  /** The agent whose personal link this is, once loaded. */
  linkAgent: PublicAgentProfile | null;
  /** The branch fixed by an agent or branch link; the visitor isn't asked. */
  lockedBranch: Branch | null;
  messages: Message[];
  error: string | null;
  /** False while the socket is reconnecting; the composer disables itself. */
  connected: boolean;
  isClosed: boolean;
  /** True while the assigned agent is composing a reply. */
  agentTyping: boolean;
  startChat: (branchId: string, visitor: VisitorDetails) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  /** Uploads a photo, video, audio file or voice note, then sends it. */
  sendMedia: (media: VisitorMediaSend) => Promise<void>;
  /** Called on every keystroke; throttled internally. */
  notifyTyping: () => void;
  startOver: () => void;
}

/**
 * `visible` is whether the chat panel is open. Only then, with the tab in front,
 * does the visitor count as having seen the agent's messages.
 */
export function useChat(config: WidgetConfig, visible: boolean): ChatController {
  const visitorId = useMemo(() => getVisitorId(), []);
  const [phase, setPhase] = useState<ChatPhase>("loading");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [conversation, setConversation] = useState<ConversationWithAgent | null>(null);
  const [linkAgent, setLinkAgent] = useState<PublicAgentProfile | null>(null);
  const [lockedBranch, setLockedBranch] = useState<Branch | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // Immediate feedback: the browser knows the network dropped long before the
  // socket misses a heartbeat.
  const [networkUp, setNetworkUp] = useState(true);

  const socketRef = useRef<ClientSocket | null>(null);
  const conversationId = conversation?.id ?? null;
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

  // Load branches, and resume an open conversation if this browser has one.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const list = await apiFetch<Branch[]>(config.apiUrl, "/api/branches");
        if (cancelled) return;
        setBranches(list);

        // A link for one agent or one branch: resolve it up front, so a
        // deactivated agent or branch says so instead of failing at "Start".
        let targetAgentId: string | null = null;
        let targetBranchId: string | null = null;
        if (config.agentId) {
          try {
            const agent = await apiFetch<PublicAgentProfile>(
              config.apiUrl,
              `/api/agents/${encodeURIComponent(config.agentId)}/public`,
            );
            if (cancelled) return;
            setLinkAgent(agent);
            setLockedBranch(list.find((branch) => branch.id === agent.branch.id) ?? null);
            targetAgentId = agent.id;
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
          targetBranchId = branch.id;
        }

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

          // An open chat with someone else stays open, but this link is for a
          // particular agent or branch, so start with that instead.
          if (
            (targetAgentId && detail.agent.id !== targetAgentId) ||
            (targetBranchId && detail.agent.branchId !== targetBranchId)
          ) {
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
  }, [config.apiUrl, config.agentId, config.branchId, visitorId]);

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
    socket.on("message:receipt", (receipt) => {
      setMessages((current) => applyReceipt(current, receipt));
    });
    socket.on("typing:update", (payload) => {
      if (payload.conversationId === conversationId && payload.senderType === "AGENT") {
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
          body: JSON.stringify({
            ...(config.agentId ? { agentId: config.agentId } : { branchId }),
            visitorId,
            visitor,
          }),
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
    [config.apiUrl, config.agentId, visitorId],
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

  const startOver = useCallback(() => {
    clearStoredConversationId();
    setConversation(null);
    setMessages([]);
    setError(null);
    setPhase("picking");
  }, []);

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
    conversation,
    linkAgent,
    lockedBranch,
    messages,
    error,
    connected: connected && networkUp,
    isClosed: conversation?.status === "CLOSED",
    agentTyping,
    startChat,
    sendMessage,
    sendMedia,
    notifyTyping,
    startOver,
  };
}
