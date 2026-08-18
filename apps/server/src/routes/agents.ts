import { Router } from "express";
import {
  agentIdParamSchema,
  listAgentConversationsQuerySchema,
  updateAgentStatusBodySchema,
} from "@repo/validation";
import { resolveActor } from "../lib/actor.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import { currentAgent, requireAgent } from "../middleware/require-agent.js";
import { emitAgentStatus } from "../realtime/emit.js";
import { setAgentStatus } from "../services/agents.js";
import { listAgentConversations } from "../services/conversations.js";

export const agentsRouter: Router = Router();

/** PATCH /api/agents/:agentId/status — the online/offline toggle. */
agentsRouter.patch(
  "/:agentId/status",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const { isOnline } = parseOrThrow(updateAgentStatusBodySchema, req.body, "status");

    const { agent, event } = await setAgentStatus(agentId, isOnline, currentAgent(req));
    emitAgentStatus(event);
    sendOk(res, agent);
  }),
);

/** GET /api/agents/:agentId/conversations — the agent inbox. */
agentsRouter.get(
  "/:agentId/conversations",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const { status } = parseOrThrow(listAgentConversationsQuerySchema, req.query, "query");

    sendOk(res, await listAgentConversations(agentId, status, resolveActor(req)));
  }),
);
