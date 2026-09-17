import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { sendOk } from "../lib/http.js";
import { parseOrThrow } from "../lib/validate.js";
import {
  agentPushSubscriptionBodySchema,
  pushSubscriptionBodySchema,
  unsubscribeBodySchema,
} from "@repo/validation";
import { env } from "../env.js";
import { pushConfigured, removeSubscription, saveSubscription } from "../services/push.js";
import { currentAgent, requireAgent } from "../middleware/require-agent.js";

export const pushRouter: Router = Router();

/**
 * GET /api/push/key — the public half of the VAPID pair, which a browser needs
 * before it can subscribe. `null` when push is not configured, so the client
 * can simply not offer it.
 */
pushRouter.get("/key", (_req, res) => {
  sendOk(res, { publicKey: pushConfigured ? (env.VAPID_PUBLIC_KEY ?? null) : null });
});

/**
 * POST /api/push/subscribe — remembers this browser for a visitor.
 *
 * Public, like the rest of the widget's endpoints: a visitor id is all a
 * visitor ever has. It only ever leads to a notification about that visitor's
 * own conversation.
 */
pushRouter.post(
  "/subscribe",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(pushSubscriptionBodySchema, req.body, "subscription");
    await saveSubscription(body.subscription, { visitorId: body.visitorId });
    sendOk(res, { subscribed: true });
  }),
);

/**
 * POST /api/push/agent/subscribe — remembers this browser for the signed-in
 * agent, so a chat can reach them with the dashboard closed.
 */
pushRouter.post(
  "/agent/subscribe",
  requireAgent,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(agentPushSubscriptionBodySchema, req.body, "subscription");
    await saveSubscription(body.subscription, { agentId: currentAgent(req).agentId });
    sendOk(res, { subscribed: true });
  }),
);

/** POST /api/push/unsubscribe — forgets one browser. */
pushRouter.post(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(unsubscribeBodySchema, req.body, "subscription");
    await removeSubscription(body.endpoint);
    sendOk(res, { subscribed: false });
  }),
);
