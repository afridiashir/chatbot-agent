import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { sendOk } from "./lib/http.js";
import { apiRouter } from "./routes/index.js";

/**
 * Endpoints the chat widget calls from a customer's own website. Everything
 * else — admin, sign-in, agent status — is only ever called by our dashboard.
 */
const WIDGET_ROUTES = [
  /^\/api\/branches(\/|$)/,
  /^\/api\/conversations(\/|$)/,
  /^\/api\/media(\/|$)/,
  /^\/api\/avatars(\/|$)/,
  /^\/api\/push(\/|$)/,
  /^\/api\/agents\/[^/]+\/public$/,
];

/**
 * With `*` in CORS_ORIGINS the widget endpoints answer any website, so clients
 * can embed the widget without us editing the server for each domain. The rest
 * of the API stays on the named origins, so only our own dashboard can call it
 * from a browser. Tokens live in localStorage rather than cookies, so a third
 * party site still cannot act as a signed-in admin.
 */
function corsMiddleware(): express.RequestHandler {
  const named = cors({ origin: env.corsOrigins, credentials: true });
  if (!env.allowAnyWidgetOrigin) return named;

  const anyOrigin = cors({ origin: true, credentials: true });
  return (req, res, next) => {
    const handler = WIDGET_ROUTES.some((route) => route.test(req.path)) ? anyOrigin : named;
    handler(req, res, next);
  };
}

export function createApp(): express.Express {
  const app = express();

  app.use(corsMiddleware());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    sendOk(res, { status: "ok", uptime: process.uptime() });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
