import { Router } from "express";
import {
  conversationIdParamSchema,
  createConversationBodySchema,
  createMessageBodySchema,
  createUploadBodySchema,
  getConversationQuerySchema,
  lookupConversationsBodySchema,
} from "@repo/validation";
import { resolveActor } from "../lib/actor.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { rateLimit } from "../lib/rate-limit.js";
import { parseOrThrow } from "../lib/validate.js";
import {
  announceMessage,
  emitConversationAssigned,
  emitConversationClosed,
  emitMessageAuthor,
} from "../realtime/emit.js";
import { requireAgent } from "../middleware/require-agent.js";
import {
  addMessage,
  closeConversation,
  createConversation,
  currentAdminAuthor,
  getConversation,
  lookupConversations,
  staffBroadcastTarget,
} from "../services/conversations.js";
import { createUpload } from "../services/media.js";

export const conversationsRouter: Router = Router();

/**
 * POST /api/conversations — assigns an agent and opens the chat.
 *
 * "No agents available" is a normal outcome, not an error, so it comes back as
 * `200 { ok: true, data: { available: false, message } }`. A newly created
 * conversation answers 201; a resumed one answers 200.
 */
conversationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createConversationBodySchema, req.body, "conversation");
    const result = await createConversation(body);

    if (result.available && !result.resumed) {
      // Lands in the agent's inbox without them refreshing.
      emitConversationAssigned(result.conversation);
    }

    const status = result.available && !result.resumed ? 201 : 200;
    sendOk(res, result, status);
  }),
);

/**
 * POST /api/conversations/lookup — the chats belonging to a phone number.
 *
 * What the widget opens on: the visitor types their number and gets their own
 * conversations back, whoever they were with. The number is the only thing
 * asked for, so the rate limit is what stops it being worked through in bulk.
 */
conversationsRouter.post(
  "/lookup",
  rateLimit({
    windowMs: 60_000,
    max: 10,
    message: "Too many attempts. Wait a minute and try again.",
  }),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(lookupConversationsBodySchema, req.body, "lookup");
    sendOk(res, await lookupConversations(body));
  }),
);

/** GET /api/conversations/:conversationId — full transcript. */
conversationsRouter.get(
  "/:conversationId",
  asyncHandler(async (req, res) => {
    const { conversationId } = parseOrThrow(
      conversationIdParamSchema,
      req.params,
      "conversation id",
    );
    const { visitorId } = parseOrThrow(getConversationQuerySchema, req.query, "query");

    sendOk(res, await getConversation(conversationId, resolveActor(req, visitorId)));
  }),
);

/** POST /api/conversations/:conversationId/messages — persist and return one message. */
conversationsRouter.post(
  "/:conversationId/messages",
  asyncHandler(async (req, res) => {
    const { conversationId } = parseOrThrow(
      conversationIdParamSchema,
      req.params,
      "conversation id",
    );
    const body = parseOrThrow(createMessageBodySchema, req.body, "message");

    const actor = resolveActor(req, body.visitorId);
    const { message, created } = await addMessage(conversationId, body, actor);

    // A retry of an already-stored message must not reach the room twice.
    if (created) {
      void announceMessage(message).catch((e: unknown) => console.error("[receipts]", e));

      // An admin answering in the agent's place: the message above went to the
      // room looking like the agent, and this tells the staff side who really
      // typed it. Never sent to the conversation room.
      if (actor.type === "ADMIN") {
        const author = await currentAdminAuthor(actor.adminId);
        if (author) {
          emitMessageAuthor(await staffBroadcastTarget(conversationId), message.id, author);
        }
      }
    }
    sendOk(res, message, created ? 201 : 200);
  }),
);

/**
 * POST /api/conversations/:conversationId/uploads — grants one media upload.
 *
 * The browser then POSTs the file straight to storage with the returned form,
 * and sends the message with `attachment.uploadToken`.
 */
conversationsRouter.post(
  "/:conversationId/uploads",
  asyncHandler(async (req, res) => {
    const { conversationId } = parseOrThrow(
      conversationIdParamSchema,
      req.params,
      "conversation id",
    );
    const body = parseOrThrow(createUploadBodySchema, req.body, "upload");
    sendOk(res, await createUpload(conversationId, body, resolveActor(req, body.visitorId)), 201);
  }),
);

/**
 * POST /api/conversations/:conversationId/close — ACTIVE -> CLOSED.
 *
 * Agent-only, so it sits behind `requireAgent`: telling an unauthenticated
 * visitor to "provide a visitor id" would be misleading, since no visitor id
 * grants this.
 */
conversationsRouter.post(
  "/:conversationId/close",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { conversationId } = parseOrThrow(
      conversationIdParamSchema,
      req.params,
      "conversation id",
    );

    const conversation = await closeConversation(conversationId, resolveActor(req));
    emitConversationClosed(conversation);
    sendOk(res, conversation);
  }),
);
