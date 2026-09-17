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
import { emitAgentProfile, emitAgentStatus } from "../realtime/emit.js";
import { setAgentStatus } from "../services/agents.js";
import {
  createAvatarUpload,
  openConversationIds,
  removeAvatar,
  setAvatar,
} from "../services/avatars.js";
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
    const actor = { kind: "agent", agent: currentAgent(req) } as const;
    sendOk(res, await createAvatarUpload(agentId, body, actor), 201);
  }),
);

/** PUT /api/agents/:agentId/avatar — use an uploaded photo as the profile picture. */
agentsRouter.put(
  "/:agentId/avatar",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const { uploadToken } = parseOrThrow(setAvatarBodySchema, req.body, "photo");
    const agent = await setAvatar(agentId, uploadToken, { kind: "agent", agent: currentAgent(req) });
    emitAgentProfile(agent, await openConversationIds(agentId));
    sendOk(res, agent);
  }),
);

/** DELETE /api/agents/:agentId/avatar — back to initials. */
agentsRouter.delete(
  "/:agentId/avatar",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const agent = await removeAvatar(agentId, { kind: "agent", agent: currentAgent(req) });
    emitAgentProfile(agent, await openConversationIds(agentId));
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
