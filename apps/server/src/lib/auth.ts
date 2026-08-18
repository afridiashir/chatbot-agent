import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { unauthorized } from "./http.js";

const TOKEN_TTL = "7d";

export interface AgentTokenPayload {
  role: "AGENT";
  agentId: string;
  branchId: string;
}

export interface AdminTokenPayload {
  role: "ADMIN";
  adminId: string;
  companyId: string;
}

export type TokenPayload = AgentTokenPayload | AdminTokenPayload;

/**
 * The `role` claim keeps the two session types from being interchangeable: an
 * agent token can never satisfy an admin route just because both are signed
 * with the same secret.
 */
const tokenPayloadSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("AGENT"),
    agentId: z.string().min(1),
    branchId: z.string().min(1),
  }),
  z.object({
    role: z.literal("ADMIN"),
    adminId: z.string().min(1),
    companyId: z.string().min(1),
  }),
]);

export function signAgentToken(payload: Omit<AgentTokenPayload, "role">): string {
  return jwt.sign({ role: "AGENT", ...payload }, env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
    subject: payload.agentId,
  });
}

export function signAdminToken(payload: Omit<AdminTokenPayload, "role">): string {
  return jwt.sign({ role: "ADMIN", ...payload }, env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
    subject: payload.adminId,
  });
}

export function verifyToken(token: string): TokenPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw unauthorized("Your session has expired, please sign in again");
  }

  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw unauthorized("Malformed session token");

  return parsed.data;
}

/** Narrowing helper for routes that specifically need an agent session. */
export function verifyAgentToken(token: string): AgentTokenPayload {
  const payload = verifyToken(token);
  if (payload.role !== "AGENT") throw unauthorized("This endpoint requires an agent session");
  return payload;
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const payload = verifyToken(token);
  if (payload.role !== "ADMIN") throw unauthorized("This endpoint requires an admin session");
  return payload;
}
