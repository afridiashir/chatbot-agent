import { Router } from "express";
import {
  avatarUploadBodySchema,
  setAvatarBodySchema,
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
import { createAvatarUpload, removeAvatar, setAvatar } from "../services/avatars.js";
import { listAgentConversations } from "../services/conversations.js";

export const agentsRouter: Router = Router();

/** PATCH /api/agents/:agentId/status — the online/offline toggle. */
agentsRouter.patch(
  "/:agentId/status",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const { isOnline } = parseOrThrow(updateAgentStatusBodySchema, req.body, "status");

    const { agent, event, companyId } = await setAgentStatus(agentId, isOnline, currentAgent(req));
    emitAgentStatus(event, companyId);
    sendOk(res, agent);
  }),
);

/** POST /api/agents/:agentId/avatar/uploads — a one-shot form for a new photo. */
agentsRouter.post(
  "/:agentId/avatar/uploads",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const body = parseOrThrow(avatarUploadBodySchema, req.body, "photo");
    sendOk(res, await createAvatarUpload(agentId, body, currentAgent(req)), 201);
  }),
);

/** PUT /api/agents/:agentId/avatar — use an uploaded photo as the profile picture. */
agentsRouter.put(
  "/:agentId/avatar",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const { uploadToken } = parseOrThrow(setAvatarBodySchema, req.body, "photo");
    sendOk(res, await setAvatar(agentId, uploadToken, currentAgent(req)));
  }),
);

/** DELETE /api/agents/:agentId/avatar — back to initials. */
agentsRouter.delete(
  "/:agentId/avatar",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    sendOk(res, await removeAvatar(agentId, currentAgent(req)));
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
