import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "@repo/db";
import { rooms } from "@repo/types";
import {
  socketAuthSchema,
  socketJoinPayloadSchema,
  socketMessagePayloadSchema,
  socketReactionPayloadSchema,
  socketTypingPayloadSchema,
} from "@repo/validation";
import type { Actor } from "../lib/actor.js";
import { verifyAgentToken, verifyAdminToken } from "../lib/auth.js";
import { loadAdminScope } from "../middleware/require-agent.js";
import { HttpError } from "../lib/http.js";
import { env } from "../env.js";
import {
  addMessage,
  assertConversationAccess,
  currentAdminAuthor,
  reactToMessage,
  staffBroadcastTarget,
} from "../services/conversations.js";
import { markReceipt } from "../services/receipts.js";
import {
  announceMessage,
  emitMessageAuthor,
  emitReaction,
  emitReceipt,
  emitVisitorStatus,
  setRealtimeServer,
  visitorsIn,
} from "./emit.js";
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

/**
 * Turns a failed handshake into an error the client can act on.
 *
 * This matters more than it looks: Socket.IO gives up for good when a
 * connection is refused by this middleware — unlike a dropped network, which it
 * retries on its own. So a moment's trouble here, a database blip while an
 * admin's scope is being read, used to leave a dashboard permanently without a
 * socket, looking connected but unable to send anything, until the person
 * signed out and in again.
 *
 * `retryable` is what tells the two apart. Bad credentials are final and the
 * person has to sign in again; anything else is ours to be sorry about, and the
 * client keeps trying.
 */
function handshakeError(error: unknown): Error & { data: { retryable: boolean } } {
  const rejected = error instanceof HttpError && (error.status === 401 || error.status === 403);
  // A malformed handshake is the client's own doing, so retrying cannot help.
  const malformed = error instanceof Error && error.message.startsWith("Invalid handshake");

  if (!rejected && !malformed) console.error("[socket] handshake", error);

  const out = new Error(
    rejected || malformed
      ? error instanceof Error
        ? error.message
        : "Authentication failed"
      : "Could not start the connection",
  ) as Error & { data: { retryable: boolean } };
  out.data = { retryable: !rejected && !malformed };
  return out;
}

/** Resolves the handshake `auth` payload into the same Actor the REST API uses. */
async function authenticate(socket: AppSocket): Promise<Actor> {
  const parsed = socketAuthSchema.safeParse(socket.handshake.auth);
  if (!parsed.success) {
    throw new Error("Invalid handshake: expected a visitorId or an agent token");
  }

  if (parsed.data.role === "AGENT") {
    const payload = verifyAgentToken(parsed.data.token);
    return { type: "AGENT", agentId: payload.agentId, branchId: payload.branchId };
  }

  if (parsed.data.role === "ADMIN") {
    // Same database check as the REST middleware: a deactivated admin cannot
    // keep watching, and the branch scope is the current one, not the token's.
    const scope = await loadAdminScope(verifyAdminToken(parsed.data.token).adminId);
    return {
      type: "ADMIN",
      adminId: scope.adminId,
      companyId: scope.companyId,
      branchId: scope.branchId,
    };
  }

  return { type: "VISITOR", visitorId: parsed.data.visitorId };
}

/** The conversation a room name refers to, or null for any other room. */
function conversationIdOf(room: string): string | null {
  const id = room.startsWith("conversation:") ? room.slice("conversation:".length) : null;
  return id || null;
}

/**
 * A visitor's socket has gone from a chat. Their last one leaving is what makes
 * them offline to the staff — a second tab closing does not.
 *
 * Best effort by design: nobody can be told about a failure here, and a
 * presence dot left on is a smaller problem than a crashed handler.
 */
async function visitorLeft(conversationId: string, socketId: string): Promise<void> {
  try {
    if ((await visitorsIn(conversationId, socketId)) > 0) return;

    // The moment they stopped being here, which is what "last seen" means.
    // Written to every browser of theirs: it describes the person, and the one
    // that just closed is not necessarily the one staff are looking at.
    const lastSeenAt = new Date();
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { visitor: { select: { phoneKey: true } } },
    });
    if (conversation) {
      await prisma.visitor.updateMany({
        where: { phoneKey: conversation.visitor.phoneKey },
        data: { lastSeenAt },
      });
    }

    emitVisitorStatus(await staffBroadcastTarget(conversationId), false, undefined, lastSeenAt);
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("[socket] visitor presence", error);
  }
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

        // A participant connecting has now received everything the other side
        // sent while they were away.
        if (actor.type !== "ADMIN") {
          const receipt = await markReceipt(conversationId, actor.type, "DELIVERED");
          if (receipt) emitReceipt(receipt);
        }

        if (actor.type === "VISITOR") {
          // They have the chat open. Their first socket is the one worth
          // announcing; a second tab changes nothing the staff can see.
          if ((await visitorsIn(conversationId, socket.id)) === 0) {
            emitVisitorStatus(await staffBroadcastTarget(conversationId), true);
          }
        } else {
          // A dashboard joining needs the state as it already is, not only
          // changes to it, or the chat it opens looks like nobody is there.
          const here = (await visitorsIn(conversationId)) > 0;
          const known = here
            ? null
            : ((
                await prisma.conversation.findUnique({
                  where: { id: conversationId },
                  select: { visitor: { select: { lastSeenAt: true } } },
                })
              )?.visitor.lastSeenAt ?? null);
          emitVisitorStatus(await staffBroadcastTarget(conversationId), here, socket, known);
        }
      } catch (error) {
        ack?.(toAckError(error));
      }
    })();
  });

  socket.on("conversation:leave", (payload) => {
    const parsed = socketJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    void socket.leave(rooms.conversation(parsed.data.conversationId));
    if (actor.type === "VISITOR") void visitorLeft(parsed.data.conversationId, socket.id);
  });

  /*
   * The tab was closed, the phone locked, the connection lost. `disconnecting`
   * rather than `disconnect` because by the latter the rooms are already gone,
   * and the rooms are the only record of which chats this socket was in.
   */
  socket.on("disconnecting", () => {
    if (actor.type !== "VISITOR") return;
    for (const room of socket.rooms) {
      const conversationId = conversationIdOf(room);
      if (conversationId) void visitorLeft(conversationId, socket.id);
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

  socket.on("conversation:read", (payload) => {
    const parsed = socketJoinPayloadSchema.safeParse(payload);
    // Admins looking at a chat must not tell the visitor it was read.
    if (!parsed.success || actor.type === "ADMIN") return;
    const { conversationId } = parsed.data;
    const reader = actor.type;

    void (async () => {
      try {
        // Checked against the database rather than room membership: a client
        // may report "read" before its join has finished. Reads are rare
        // enough (once per new message on screen) for the lookup to be cheap.
        await assertConversationAccess(conversationId, actor);
        const receipt = await markReceipt(conversationId, reader, "READ");
        if (receipt) emitReceipt(receipt);
      } catch (error) {
        if (!(error instanceof HttpError)) console.error("[socket] read receipt", error);
      }
    })();
  });

  socket.on("message:react", (payload, ack) => {
    void (async () => {
      try {
        const { messageId, emoji } = socketReactionPayloadSchema.parse(payload);
        const { conversationId, reactions } = await reactToMessage(messageId, emoji, actor);
        emitReaction(conversationId, messageId, reactions);
        ack?.({ ok: true, data: reactions });
      } catch (error) {
        ack?.(toAckError(error));
      }
    })();
  });

  socket.on("message:send", (payload, ack) => {
    void (async () => {
      try {
        const { conversationId, content, clientId, attachment, replyToId } =
          socketMessagePayloadSchema.parse(payload);
        // An admin stepping in sends as the agent, exactly as over REST; only a
        // visitor speaks as the visitor. `addMessage` re-checks scope.
        const senderType = actor.type === "VISITOR" ? "VISITOR" : "AGENT";

        // Persisted first: PostgreSQL is the record of what was said, and the
        // broadcast only reports what was already durably stored.
        const { message, created } = await addMessage(
          conversationId,
          { content, senderType, clientId, attachment, replyToId },
          actor,
        );
        if (created) {
          void announceMessage(message).catch((e: unknown) => console.error("[socket]", e));
          if (actor.type === "ADMIN") {
            void (async () => {
              const author = await currentAdminAuthor(actor.adminId);
              if (author) {
                emitMessageAuthor(await staffBroadcastTarget(conversationId), message.id, author);
              }
            })().catch((e: unknown) => console.error("[socket] author", e));
          }
        }

        ack?.({ ok: true, data: message });
      } catch (error) {
        ack?.(toAckError(error));
      }
    })();
  });
}

export function createSocketServer(httpServer: HttpServer): AppServer {
  const io: AppServer = new Server(httpServer, {
    // Visitors chat from the customer's website; the handshake is still
    // authenticated (agent token, or a visitor id tied to the conversation).
    cors: { origin: env.allowAnyWidgetOrigin ? true : env.corsOrigins, credentials: true },
    // Defaults (25s interval, 20s timeout) leave a dead connection undetected
    // for up to 45 seconds, which is far too long to keep showing an agent a
    // chat they can no longer receive messages on.
    pingInterval: 10_000,
    pingTimeout: 5_000,
  });

  io.use((socket, next) => {
    authenticate(socket)
      .then((actor) => {
        socket.data = actor;
        next();
      })
      .catch((error: unknown) => {
        next(handshakeError(error));
      });
  });

  io.on("connection", (socket) => {
    const actor = socket.data;

    if (actor.type === "AGENT") {
      // Their own inbox feed. Visitors join nothing automatically — only the
      // conversation rooms they own.
      void socket.join(rooms.agent(actor.agentId));
    }

    if (actor.type === "ADMIN") {
      // Status changes for exactly what this admin is allowed to see.
      void socket.join(
        actor.branchId ? rooms.adminBranch(actor.branchId) : rooms.adminCompany(actor.companyId),
      );
    }

    registerHandlers(socket);
  });

  setRealtimeServer(io);
  return io;
}
