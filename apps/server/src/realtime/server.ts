import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { rooms } from "@repo/types";
import {
  socketAuthSchema,
  socketJoinPayloadSchema,
  socketMessagePayloadSchema,
  socketTypingPayloadSchema,
} from "@repo/validation";
import type { Actor } from "../lib/actor.js";
import { verifyAgentToken, verifyAdminToken } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { env } from "../env.js";
import { addMessage, assertConversationAccess } from "../services/conversations.js";
import { emitMessage, setRealtimeServer } from "./emit.js";
import type { AppServer, AppSocket } from "./types.js";

/**
 * Turns whatever a handler threw into an ack the client can act on, without
 * leaking internals. Unexpected failures are logged server-side.
 */
function toAckError(error: unknown): { ok: false; message: string } {
  if (error instanceof HttpError) return { ok: false, message: error.message };
  console.error("[socket]", error);
  return { ok: false, message: "Something went wrong" };
}

/** Resolves the handshake `auth` payload into the same Actor the REST API uses. */
function authenticate(socket: AppSocket): Actor {
  const parsed = socketAuthSchema.safeParse(socket.handshake.auth);
  if (!parsed.success) {
    throw new Error("Invalid handshake: expected a visitorId or an agent token");
  }

  if (parsed.data.role === "AGENT") {
    const payload = verifyAgentToken(parsed.data.token);
    return { type: "AGENT", agentId: payload.agentId, branchId: payload.branchId };
  }

  if (parsed.data.role === "ADMIN") {
    const payload = verifyAdminToken(parsed.data.token);
    return { type: "ADMIN", adminId: payload.adminId, companyId: payload.companyId };
  }

  return { type: "VISITOR", visitorId: parsed.data.visitorId };
}

function registerHandlers(socket: AppSocket): void {
  const actor = socket.data;

  socket.on("conversation:join", (payload, ack) => {
    void (async () => {
      try {
        const { conversationId } = socketJoinPayloadSchema.parse(payload);
        // Joining a room is read access to everything said in it, so it gets
        // the same ownership check as GET /api/conversations/:id.
        await assertConversationAccess(conversationId, actor);
        await socket.join(rooms.conversation(conversationId));
        ack?.({ ok: true });
      } catch (error) {
        ack?.(toAckError(error));
      }
    })();
  });

  socket.on("conversation:leave", (payload) => {
    const parsed = socketJoinPayloadSchema.safeParse(payload);
    if (parsed.success) {
      void socket.leave(rooms.conversation(parsed.data.conversationId));
    }
  });

  socket.on("typing", (payload) => {
    const parsed = socketTypingPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    // Admin sockets observe conversations; they never appear as participants.
    if (actor.type === "ADMIN") return;

    const room = rooms.conversation(parsed.data.conversationId);
    // Membership was already access-checked at `conversation:join`, so being in
    // the room is sufficient proof — and costs no database round trip on what
    // is a per-keystroke event.
    if (!socket.rooms.has(room)) return;

    // `socket.to` excludes the sender: nobody needs to watch themselves type.
    socket.to(room).emit("typing:update", {
      conversationId: parsed.data.conversationId,
      senderType: actor.type === "AGENT" ? "AGENT" : "VISITOR",
      isTyping: parsed.data.isTyping,
    });
  });

  socket.on("message:send", (payload, ack) => {
    void (async () => {
      try {
        const { conversationId, content, clientId } = socketMessagePayloadSchema.parse(payload);
        if (actor.type === "ADMIN") {
          // Admin access to conversations is observation only.
          ack?.({ ok: false, message: "Admins cannot send messages" });
          return;
        }

        const senderType = actor.type === "AGENT" ? "AGENT" : "VISITOR";

        // Persisted first: PostgreSQL is the record of what was said, and the
        // broadcast only reports what was already durably stored.
        const { message, created } = await addMessage(
          conversationId,
          { content, senderType, clientId },
          actor,
        );
        if (created) emitMessage(message);

        ack?.({ ok: true, data: message });
      } catch (error) {
        ack?.(toAckError(error));
      }
    })();
  });
}

export function createSocketServer(httpServer: HttpServer): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Defaults (25s interval, 20s timeout) leave a dead connection undetected
    // for up to 45 seconds, which is far too long to keep showing an agent a
    // chat they can no longer receive messages on.
    pingInterval: 10_000,
    pingTimeout: 5_000,
  });

  io.use((socket, next) => {
    try {
      socket.data = authenticate(socket);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const actor = socket.data;

    if (actor.type === "AGENT") {
      // Their own inbox feed. Visitors join nothing automatically — only the
      // conversation rooms they own.
      void socket.join(rooms.agent(actor.agentId));
    }

    if (actor.type === "ADMIN") {
      // Company-wide status changes.
      void socket.join(rooms.admin());
    }

    registerHandlers(socket);
  });

  setRealtimeServer(io);
  return io;
}
