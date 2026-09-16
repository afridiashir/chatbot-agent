import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { ensureBucket } from "./lib/storage.js";
import { createSocketServer } from "./realtime/server.js";

const app = createApp();
const httpServer = createServer(app);

const io = createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
});

// Media is optional for text chat, so a storage outage is logged, not fatal.
ensureBucket().catch((error: unknown) => {
  console.error("[storage] could not reach MinIO; media messages will fail:", error);
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received, shutting down`);
  void io.close(() => {
    httpServer.close(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
