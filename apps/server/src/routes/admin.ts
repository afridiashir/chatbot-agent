import { Router } from "express";
import {
  agentIdParamSchema,
  branchIdParamSchema,
  conversationIdParamSchema,
  createAgentBodySchema,
  createBranchBodySchema,
  listAdminConversationsQuerySchema,
  listLeadsQuerySchema,
  loginBodySchema,
  updateAgentBodySchema,
  updateBranchBodySchema,
} from "@repo/validation";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import { currentAdmin, requireAdmin } from "../middleware/require-agent.js";
import { emitAgentStatus, emitConversationClosed } from "../realtime/emit.js";
import {
  createAgent,
  createBranch,
  getAdmin,
  getAnyConversation,
  getStats,
  listAllConversations,
  listLeads,
  loginAdmin,
  updateAgent,
  updateBranch,
} from "../services/admin.js";
import { listBranchesWithAgents } from "../services/branches.js";

export const adminRouter: Router = Router();

/* ----------------------------------- auth ---------------------------------- */

/** POST /api/admin/auth/login — separate from the agent login by design. */
adminRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(loginBodySchema, req.body, "credentials");
    sendOk(res, await loginAdmin(body));
  }),
);

adminRouter.get(
  "/auth/me",
  requireAdmin,
  asyncHandler(async (req, res) => {
    sendOk(res, await getAdmin(currentAdmin(req).adminId));
  }),
);

/* ---------------------------------- summary -------------------------------- */

adminRouter.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req, res) => {
    sendOk(res, await getStats(currentAdmin(req)));
  }),
);

/** Every branch with its agents, including deactivated ones. */
adminRouter.get(
  "/branches",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    sendOk(res, await listBranchesWithAgents());
  }),
);

/* --------------------------------- branches -------------------------------- */

adminRouter.post(
  "/branches",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createBranchBodySchema, req.body, "branch");
    sendOk(res, await createBranch(body, currentAdmin(req)), 201);
  }),
);

adminRouter.patch(
  "/branches/:branchId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { branchId } = parseOrThrow(branchIdParamSchema, req.params, "branch id");
    const body = parseOrThrow(updateBranchBodySchema, req.body, "branch");
    sendOk(res, await updateBranch(branchId, body, currentAdmin(req)));
  }),
);

/* ---------------------------------- agents --------------------------------- */

adminRouter.post(
  "/agents",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createAgentBodySchema, req.body, "agent");
    sendOk(res, await createAgent(body, currentAdmin(req)), 201);
  }),
);

adminRouter.patch(
  "/agents/:agentId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { agentId } = parseOrThrow(agentIdParamSchema, req.params, "agent id");
    const body = parseOrThrow(updateAgentBodySchema, req.body, "agent");

    const { closed, ...result } = await updateAgent(agentId, body, currentAdmin(req));

    if (body.isActive === false) {
      // Deactivation forces the agent offline; tell the dashboards so their
      // availability indicators do not go stale.
      emitAgentStatus({
        agentId: result.agent.id,
        branchId: result.agent.branchId,
        isOnline: false,
      });
      // And tell anyone sitting in one of the chats it just ended, rather than
      // leaving them typing into a conversation nobody will answer.
      for (const conversation of closed) emitConversationClosed(conversation);
    }

    sendOk(res, result);
  }),
);

/* ----------------------------------- leads --------------------------------- */

/** GET /api/admin/leads — everyone who filled the form, answered or not. */
adminRouter.get(
  "/leads",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listLeadsQuerySchema, req.query, "query");
    sendOk(res, await listLeads(query, currentAdmin(req)));
  }),
);

/* ------------------------------- conversations ------------------------------ */

/** GET /api/admin/conversations — every agent's chats, filterable. */
adminRouter.get(
  "/conversations",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listAdminConversationsQuerySchema, req.query, "query");
    sendOk(res, await listAllConversations(query, currentAdmin(req)));
  }),
);

/** GET /api/admin/conversations/:id — read-only transcript. */
adminRouter.get(
  "/conversations/:conversationId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { conversationId } = parseOrThrow(
      conversationIdParamSchema,
      req.params,
      "conversation id",
    );
    sendOk(res, await getAnyConversation(conversationId, currentAdmin(req)));
  }),
);
