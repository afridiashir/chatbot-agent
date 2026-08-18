import type { AdminTokenPayload, AgentTokenPayload } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `requireAgent` middleware. */
      agent?: AgentTokenPayload;
      /** Populated by the `requireAdmin` middleware. */
      admin?: AdminTokenPayload;
    }
  }
}

export {};
