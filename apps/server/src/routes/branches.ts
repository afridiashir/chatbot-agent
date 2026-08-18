import { Router } from "express";
import { branchIdParamSchema } from "@repo/validation";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import { requireAgent } from "../middleware/require-agent.js";
import { listBranchAgents, listBranches } from "../services/branches.js";

export const branchesRouter: Router = Router();

/** GET /api/branches — the picker the widget shows before a chat starts. */
branchesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    sendOk(res, await listBranches());
  }),
);

/**
 * GET /api/branches/:branchId/agents — agents plus their active load.
 *
 * Agent-only: this exposes staff names and email addresses, and those emails
 * are also login identifiers. The widget never needs it — it only lists branch
 * names — so there is no reason to leave it public.
 */
branchesRouter.get(
  "/:branchId/agents",
  requireAgent,
  asyncHandler(async (req, res) => {
    const { branchId } = parseOrThrow(branchIdParamSchema, req.params, "branch id");
    sendOk(res, await listBranchAgents(branchId));
  }),
);
