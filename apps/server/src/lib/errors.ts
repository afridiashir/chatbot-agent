import type { NextFunction, Request, Response } from "express";
import { HttpError, sendError } from "./http.js";
import { isProduction } from "../env.js";

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 404, "NOT_FOUND", "Endpoint not found");
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  console.error("[unhandled]", err);
  sendError(
    res,
    500,
    "INTERNAL_ERROR",
    isProduction ? "Something went wrong" : String(err instanceof Error ? err.message : err),
  );
}
