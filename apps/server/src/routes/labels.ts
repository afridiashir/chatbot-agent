import { Router } from "express";
import { conversationLabelParamSchema } from "@repo/validation";
import { resolveActor } from "../lib/actor.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import { currentAgent, requireAgent } from "../middleware/require-agent.js";
import { emitConversationLabels } from "../realtime/emit.js";
import { staffBroadcastTarget } from "../services/conversations.js";
import {
  addConversationLabel,
  listLabelsForBranch,
  removeConversationLabel,
} from "../services/labels.js";

export const labelsRouter: Router = Router();

/**
 * Mounted under `/api/conversations`, alongside the main conversations router.
 * Express tries each router at a mount path in turn, and nothing in the other
 * one matches a three-segment `/:id/labels/:labelId`, so these are reached.
 */
export const conversationLabelsRouter: Router = Router();

/**
 * GET /api/labels — the company's labels, for an agent's picker.
 *
 * Agent-authenticated. Admins read the same list through
 * `/api/admin/labels`, which also carries usage counts.
 */
labelsRouter.get(
  "/",
  requireAgent,
  asyncHandler(async (req, res) => {
    sendOk(res, await listLabelsForBranch(currentAgent(req).branchId));
  }),
);

/*
 * Applying a label is the one write an admin has on a conversation they are
 * otherwise only reading, so these two live outside the admin router and take
 * either kind of caller. The service decides: an agent may label their own
 * chats, an admin any chat in their scope.
 */

/** PUT /api/conversations/:conversationId/labels/:labelId — idempotent. */
conversationLabelsRouter.put(
  "/:conversationId/labels/:labelId",
  asyncHandler(async (req, res) => {
    const { conversationId, labelId } = parseOrThrow(
      conversationLabelParamSchema,
      req.params,
      "label",
    );
    const labels = await addConversationLabel(conversationId, labelId, resolveActor(req));
    emitConversationLabels(await staffBroadcastTarget(conversationId), labels);
    sendOk(res, labels);
  }),
);

/** DELETE /api/conversations/:conversationId/labels/:labelId — also idempotent. */
conversationLabelsRouter.delete(
  "/:conversationId/labels/:labelId",
  asyncHandler(async (req, res) => {
    const { conversationId, labelId } = parseOrThrow(
      conversationLabelParamSchema,
      req.params,
      "label",
    );
    const labels = await removeConversationLabel(conversationId, labelId, resolveActor(req));
    emitConversationLabels(await staffBroadcastTarget(conversationId), labels);
    sendOk(res, labels);
  }),
);
