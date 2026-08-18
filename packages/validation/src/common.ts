import { z } from "zod";

/** Prisma generates cuids for every id; validate shape without being strict about the flavour. */
export const idSchema = z.string().min(1, "Required").max(64);

/**
 * Visitor ids are generated client-side and kept in localStorage, so treat them
 * as untrusted input with a conservative character set.
 */
export const visitorIdSchema = z
  .string()
  .min(8, "Visitor id is too short")
  .max(64, "Visitor id is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Visitor id contains invalid characters");

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(4000, "Message is too long");

/** Client-generated idempotency key (a uuid in practice). */
export const clientIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid client id");

export const conversationStatusSchema = z.enum(["ACTIVE", "CLOSED"]);
export const senderTypeSchema = z.enum(["VISITOR", "AGENT"]);
