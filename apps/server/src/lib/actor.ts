import type { Request } from "express";
import { verifyToken } from "./auth.js";
import { unauthorized } from "./http.js";

/**
 * Who is making a request. A conversation is reachable by the agent who owns
 * it, the visitor who started it, or an admin of the company — and by nobody
 * else.
 */
export type Actor =
  | { type: "AGENT"; agentId: string; branchId: string }
  | { type: "ADMIN"; adminId: string; companyId: string }
  | { type: "VISITOR"; visitorId: string };

const BEARER_PREFIX = "Bearer ";

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length).trim();
}

export function resolveActor(req: Request, visitorId?: string): Actor {
  const token = bearerToken(req);

  // A malformed token is an error even if a visitorId was also supplied —
  // silently downgrading to visitor access would hide broken sessions.
  if (token) {
    const payload = verifyToken(token);
    return payload.role === "AGENT"
      ? { type: "AGENT", agentId: payload.agentId, branchId: payload.branchId }
      : { type: "ADMIN", adminId: payload.adminId, companyId: payload.companyId };
  }

  if (visitorId) return { type: "VISITOR", visitorId };

  throw unauthorized("Provide a visitor id or sign in");
}
