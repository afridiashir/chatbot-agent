import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { sendOk } from "./lib/http.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    sendOk(res, { status: "ok", uptime: process.uptime() });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
