import { Router } from "express";
import {
  agentIdParamSchema,
  branchIdParamSchema,
  conversationIdParamSchema,
  createAgentBodySchema,
  createBranchBodySchema,
  listAdminConversationsQuerySchema,
  listLeadsQuerySchema,
  leadsTableQuerySchema,
  analyticsQuerySchema,
  adminSearchQuerySchema,
  changePasswordBodySchema,
  updateAdminProfileBodySchema,
  loginBodySchema,
  updateAgentBodySchema,
  updateBranchBodySchema,
  leadIdParamSchema,
  adminIdParamSchema,
  createAdminBodySchema,
  updateAdminBodySchema,
} from "@repo/validation";
import { branchScope } from "../lib/admin-scope.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import { currentAdmin, requireAdmin } from "../middleware/require-agent.js";
import { emitAgentStatus, emitConversationClosed } from "../realtime/emit.js";
import {
  createAdmin,
  createAgent,
  createBranch,
  listAdmins,
  updateAdmin,
  getAdmin,
  getAnyConversation,
  getLead,
  changeAdminPassword,
  getStats,
  searchAdmin,
  updateAdminProfile,
  listAllConversations,
  listLeads,
  listLeadsTable,
  loginAdmin,
  updateAgent,
  updateBranch,
} from "../services/admin.js";
import { getAnalytics } from "../services/analytics.js";
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

/** PATCH /api/admin/auth/me — the signed-in admin renames themselves. */
adminRouter.patch(
  "/auth/me",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(updateAdminProfileBodySchema, req.body, "profile");
    sendOk(res, await updateAdminProfile(body, currentAdmin(req)));
  }),
);

/** POST /api/admin/auth/password — requires the current password. */
adminRouter.post(
  "/auth/password",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(changePasswordBodySchema, req.body, "password");
    await changeAdminPassword(body, currentAdmin(req));
    sendOk(res, { changed: true });
  }),
);

/** GET /api/admin/search?q= — the top-bar search across the company. */
adminRouter.get(
  "/search",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(adminSearchQuerySchema, req.query, "query");
    sendOk(res, await searchAdmin(query, currentAdmin(req)));
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

/** GET /api/admin/analytics?days=7&tz=Asia/Karachi — the overview charts. */
adminRouter.get(
  "/analytics",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(analyticsQuerySchema, req.query, "query");
    sendOk(res, await getAnalytics(query, currentAdmin(req)));
  }),
);

/** Every branch with its agents, including deactivated ones. */
adminRouter.get(
  "/branches",
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Scoped to the admin's company, and to one branch for a branch admin.
    sendOk(res, await listBranchesWithAgents(branchScope(currentAdmin(req))));
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
      emitAgentStatus(
        { agentId: result.agent.id, branchId: result.agent.branchId, isOnline: false },
        currentAdmin(req).companyId,
      );
      // And tell anyone sitting in one of the chats it just ended, rather than
      // leaving them typing into a conversation nobody will answer.
      for (const conversation of closed) emitConversationClosed(conversation);
    }

    sendOk(res, result);
  }),
);

/* ------------------------------ admin accounts ----------------------------- */

/** GET /api/admin/admins — company admins only. */
adminRouter.get(
  "/admins",
  requireAdmin,
  asyncHandler(async (req, res) => {
    sendOk(res, await listAdmins(currentAdmin(req)));
  }),
);

/** POST /api/admin/admins — `branchId: null` creates a company admin. */
adminRouter.post(
  "/admins",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createAdminBodySchema, req.body, "admin");
    sendOk(res, await createAdmin(body, currentAdmin(req)), 201);
  }),
);

adminRouter.patch(
  "/admins/:adminId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { adminId } = parseOrThrow(adminIdParamSchema, req.params, "admin id");
    const body = parseOrThrow(updateAdminBodySchema, req.body, "admin");
    sendOk(res, await updateAdmin(adminId, body, currentAdmin(req)));
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

/**
 * GET /api/admin/leads/table — the filterable, sortable, paginated table.
 * Registered before `/leads/:leadId` so "table" is never read as an id.
 */
adminRouter.get(
  "/leads/table",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(leadsTableQuerySchema, req.query, "query");
    sendOk(res, await listLeadsTable(query, currentAdmin(req)));
  }),
);

/** GET /api/admin/leads/:leadId — one lead with its full enquiry history. */
adminRouter.get(
  "/leads/:leadId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { leadId } = parseOrThrow(leadIdParamSchema, req.params, "lead id");
    sendOk(res, await getLead(leadId, currentAdmin(req)));
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
