import type { ZodType } from "zod";
import { HttpError } from "./http.js";

/**
 * Parse untrusted input, converting a Zod failure into a 400 with field-level
 * details that the client can render next to the offending input.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown, label = "request"): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  throw new HttpError(400, "VALIDATION_ERROR", `Invalid ${label}`, details);
}
