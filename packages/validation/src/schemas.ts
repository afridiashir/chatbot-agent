import { z } from "zod";
import {
  clientIdSchema,
  conversationStatusSchema,
  idSchema,
  messageContentSchema,
  visitorIdSchema,
} from "./common";

/* ---------------------------------- params --------------------------------- */

export const branchIdParamSchema = z.object({ branchId: idSchema });
export const agentIdParamSchema = z.object({ agentId: idSchema });
export const conversationIdParamSchema = z.object({ conversationId: idSchema });

/* ----------------------------------- auth ---------------------------------- */

export const loginBodySchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/* ---------------------------------- admin ---------------------------------- */

const nameSchema = z.string().trim().min(2, "Too short").max(80, "Too long");
const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long");

export const createBranchBodySchema = z.object({ name: nameSchema });

export const updateBranchBodySchema = z
  .object({ name: nameSchema.optional(), isActive: z.boolean().optional() })
  .refine((body) => body.name !== undefined || body.isActive !== undefined, {
    message: "Provide something to change",
  });

export const createAgentBodySchema = z.object({
  branchId: idSchema,
  name: nameSchema,
  email: z.email("Enter a valid email address"),
  password: passwordSchema,
});

export const updateAgentBodySchema = z
  .object({
    name: nameSchema.optional(),
    email: z.email("Enter a valid email address").optional(),
    branchId: idSchema.optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Provide something to change",
  });

export const listAdminConversationsQuerySchema = z.object({
  branchId: idSchema.optional(),
  agentId: idSchema.optional(),
  status: conversationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const listLeadsQuerySchema = z.object({
  branchId: idSchema.optional(),
  /** Only people whose enquiry never reached an agent. */
  missedOnly: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === true || value === "true"),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/* ---------------------------------- agents --------------------------------- */

export const updateAgentStatusBodySchema = z.object({
  isOnline: z.boolean(),
});

export const listAgentConversationsQuerySchema = z.object({
  status: conversationStatusSchema.optional(),
});

/* -------------------------------- visitors --------------------------------- */

/**
 * Collected by the widget's pre-chat form. Phone numbers vary far too much
 * between countries to validate strictly, so this only rejects input that is
 * obviously not a phone number.
 */
export const visitorDetailsSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80, "That name is too long"),
  email: z.email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(7, "That number looks too short")
    .max(24, "That number looks too long")
    .regex(/^[0-9+()\-.\s]+$/, "Use digits, spaces and + ( ) - only"),
});

/* ------------------------------- conversations ------------------------------ */

export const createConversationBodySchema = z.object({
  branchId: idSchema,
  visitorId: visitorIdSchema,
  /** Contact details from the pre-chat form. */
  visitor: visitorDetailsSchema,
  /** Optional opening message so the agent sees intent immediately. */
  initialMessage: messageContentSchema.optional(),
});

export const getConversationQuerySchema = z.object({
  /** Visitors must prove ownership of the conversation they are reading. */
  visitorId: visitorIdSchema.optional(),
});

export const findVisitorConversationQuerySchema = z.object({
  visitorId: visitorIdSchema,
});

export const createMessageBodySchema = z.object({
  content: messageContentSchema,
  senderType: z.enum(["VISITOR", "AGENT"]),
  /** Required when senderType is VISITOR; agents authenticate with a bearer token. */
  visitorId: visitorIdSchema.optional(),
  /** Supplied by clients that queue offline, so a retry cannot duplicate. */
  clientId: clientIdSchema.optional(),
});

/* --------------------------------- sockets --------------------------------- */

export const socketAuthSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("VISITOR"), visitorId: visitorIdSchema }),
  z.object({ role: z.literal("AGENT"), token: z.string().min(1) }),
  z.object({ role: z.literal("ADMIN"), token: z.string().min(1) }),
]);

export const socketJoinPayloadSchema = z.object({ conversationId: idSchema });

export const socketMessagePayloadSchema = z.object({
  conversationId: idSchema,
  content: messageContentSchema,
  clientId: clientIdSchema.optional(),
});

export const socketTypingPayloadSchema = z.object({
  conversationId: idSchema,
  isTyping: z.boolean(),
});

/* ----------------------------- inferred payloads ---------------------------- */

export type LoginBody = z.infer<typeof loginBodySchema>;
export type UpdateAgentStatusBody = z.infer<typeof updateAgentStatusBodySchema>;
export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;
export type VisitorDetails = z.infer<typeof visitorDetailsSchema>;
export type CreateMessageBody = z.infer<typeof createMessageBodySchema>;
export type SocketAuthInput = z.infer<typeof socketAuthSchema>;
export type CreateBranchBody = z.infer<typeof createBranchBodySchema>;
export type UpdateBranchBody = z.infer<typeof updateBranchBodySchema>;
export type CreateAgentBody = z.infer<typeof createAgentBodySchema>;
export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>;
export type ListAdminConversationsQuery = z.infer<typeof listAdminConversationsQuerySchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
