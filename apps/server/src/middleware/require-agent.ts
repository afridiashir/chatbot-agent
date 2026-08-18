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

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) throw unauthorized("Sign in to continue");

  req.admin = verifyAdminToken(token);
  next();
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
