import { Router } from "express";
import { loginBodySchema } from "@repo/validation";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import { currentAgent, requireAgent } from "../middleware/require-agent.js";
import { getAgent, loginAgent } from "../services/agents.js";

export const authRouter: Router = Router();

/** POST /api/auth/login — exchanges credentials for a bearer token. */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(loginBodySchema, req.body, "credentials");
    sendOk(res, await loginAgent(body));
  }),
);

/** GET /api/auth/me — lets the dashboard revalidate a stored token on load. */
authRouter.get(
  "/me",
  requireAgent,
  asyncHandler(async (req, res) => {
    sendOk(res, await getAgent(currentAgent(req).agentId));
  }),
);
