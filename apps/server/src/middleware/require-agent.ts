import { prisma } from "@repo/db";
import type { NextFunction, Request, Response } from "express";
import { bearerToken } from "../lib/actor.js";
import { verifyAgentToken, verifyAdminToken } from "../lib/auth.js";
import type { AdminTokenPayload, AgentTokenPayload } from "../lib/auth.js";
import { unauthorized } from "../lib/http.js";

export function requireAgent(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) throw unauthorized("Sign in to continue");

  req.agent = verifyAgentToken(token);
  next();
}

/**
 * Verifies the token, then reloads the admin. The scope (company, branch) comes
 * from the database rather than the token, so moving or deactivating an admin
 * takes effect on their very next request instead of when the token expires.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) throw unauthorized("Sign in to continue");
    req.admin = await loadAdminScope(verifyAdminToken(token).adminId);
    next();
  } catch (error) {
    next(error);
  }
}

export async function loadAdminScope(adminId: string): Promise<AdminTokenPayload> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, companyId: true, branchId: true, isActive: true },
  });
  if (!admin || !admin.isActive) {
    throw unauthorized("Your admin access has been removed. Contact your company admin.");
  }
  return { role: "ADMIN", adminId: admin.id, companyId: admin.companyId, branchId: admin.branchId };
}

/** Narrows `req.agent` for handlers mounted behind `requireAgent`. */
export function currentAgent(req: Request): AgentTokenPayload {
  if (!req.agent) throw unauthorized("Sign in to continue");
  return req.agent;
}

/** Narrows `req.admin` for handlers mounted behind `requireAdmin`. */
export function currentAdmin(req: Request): AdminTokenPayload {
  if (!req.admin) throw unauthorized("Sign in to continue");
  return req.admin;
}
