import type { Response } from "express";
import type { ApiError, ApiErrorCode, ApiSuccess } from "@repo/types";

export function sendOk<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccess<T> = { ok: true, data };
  return res.status(status).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>,
): Response {
  const body: ApiError = { ok: false, error: { code, message, ...(details ? { details } : {}) } };
  return res.status(status).json(body);
}

/** Thrown by services; translated to a response by the error middleware. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (message = "Resource not found") =>
  new HttpError(404, "NOT_FOUND", message);
export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Not allowed") => new HttpError(403, "FORBIDDEN", message);
export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);
