import { Router } from "express";
import {
  conversationIdParamSchema,
  createConversationBodySchema,
  createMessageBodySchema,
  getConversationQuerySchema,
} from "@repo/validation";
import { resolveActor } from "../lib/actor.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import {
  emitConversationAssigned,
  emitConversationClosed,
  emitMessage,
} from "../realtime/emit.js";
import { requireAgent } from "../middleware/require-agent.js";
import {
  addMessage,
  closeConversation,
  createConversation,
  getConversation,
} from "../services/conversations.js";

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

    const { message, created } = await addMessage(
      conversationId,
      body,
      resolveActor(req, body.visitorId),
    );
    // A retry of an already-stored message must not reach the room twice.
    if (created) emitMessage(message);
    sendOk(res, message, created ? 201 : 200);
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
