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
export const leadIdParamSchema = z.object({ leadId: idSchema });

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

/** The signed-in admin editing their own account. */
export const updateAdminProfileBodySchema = z.object({ name: nameSchema });

export const adminIdParamSchema = z.object({ adminId: idSchema });

/** A company admin creating another admin. `branchId: null` makes a company admin. */
export const createAdminBodySchema = z.object({
  name: nameSchema,
  email: z.email("Enter a valid email address"),
  password: passwordSchema,
  branchId: idSchema.nullable(),
});

export const updateAdminBodySchema = z
  .object({
    name: nameSchema.optional(),
    email: z.email("Enter a valid email address").optional(),
    password: passwordSchema.optional(),
    branchId: idSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Provide something to change",
  });

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: "Choose a password you are not already using",
    path: ["newPassword"],
  });

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(120),
});

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

/** Columns the leads table can be ordered by. */
export const LEAD_SORTS = [
  "name",
  "email",
  "branch",
  "enquiries",
  "missed",
  "firstEnquiryAt",
  "lastEnquiryAt",
] as const;

/** GET /api/admin/leads/table — every filter the leads table offers. */
export const leadsTableQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    branchId: idSchema.optional(),
    agentId: idSchema.optional(),
    /** `missed`: at least one enquiry found nobody. `answered`: none did. */
    outcome: z.enum(["missed", "answered"]).optional(),
    /** State of the lead's most recent conversation, or `none` if they never had one. */
    conversation: z.enum(["open", "closed", "none"]).optional(),
    /** `new`: got in touch once. `returning`: more than once. */
    visits: z.enum(["new", "returning"]).optional(),
    /** Only leads with an enquiry inside [from, to). ISO timestamps. */
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    sort: z.enum(LEAD_SORTS).default("lastEnquiryAt"),
    dir: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(25),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, {
    message: "`from` must be before `to`",
    path: ["to"],
  });

/** The date-range presets the overview offers. */
export const ANALYTICS_RANGES = [1, 7, 14, 30, 90] as const;

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (ANALYTICS_RANGES as readonly number[]).includes(value), {
      message: `days must be one of ${ANALYTICS_RANGES.join(", ")}`,
    })
    .default(7),
  /**
   * The viewer's IANA time zone, so "per day" and "per hour" mean the admin's
   * own days rather than UTC ones. Checked against the runtime's zone database
   * before it ever reaches SQL.
   */
  tz: z
    .string()
    .max(64)
    // Named zones only. PostgreSQL reads a bare offset like "+05:00" as POSIX,
    // with the sign inverted, so it would silently shift every bucket.
    .regex(/^[A-Za-z]+(?:[/_+-][A-Za-z0-9]+)*$/, "Use a named time zone, such as Asia/Karachi")
    .refine(
      (zone) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Unknown time zone" },
    )
    .default("UTC"),
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

export const createConversationBodySchema = z
  .object({
    /** Required unless `agentId` is given, whose branch is then used. */
    branchId: idSchema.optional(),
    /** From an agent's personal chat link: the chat goes to this agent, online or not. */
    agentId: idSchema.optional(),
    visitorId: visitorIdSchema,
    /** Contact details from the pre-chat form. */
    visitor: visitorDetailsSchema,
    /** Optional opening message so the agent sees intent immediately. */
    initialMessage: messageContentSchema.optional(),
  })
  .refine((body) => body.branchId || body.agentId, {
    message: "Choose a branch",
    path: ["branchId"],
  });

export const getConversationQuerySchema = z.object({
  /** Visitors must prove ownership of the conversation they are reading. */
  visitorId: visitorIdSchema.optional(),
});

export const findVisitorConversationQuerySchema = z.object({
  visitorId: visitorIdSchema,
});

/** A media message references an upload ticket rather than a raw object key. */
export const messageAttachmentSchema = z.object({
  uploadToken: z.string().min(1).max(4000),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  /** Voice-note loudness bars, 0-100 each. */
  waveform: z.array(z.number().int().min(0).max(100)).max(128).optional(),
});

/** Text is optional when media is attached: then it is a caption. */
const withContentOrAttachment = <T extends { content: string; attachment?: unknown }>(body: T) =>
  body.content.length > 0 || body.attachment !== undefined;
const EMPTY_MESSAGE = { message: "Message cannot be empty", path: ["content"] };

export const avatarUploadBodySchema = z.object({
  mimeType: z.string().trim().min(3).max(120),
  size: z.number().int().positive(),
});

export const setAvatarBodySchema = z.object({ uploadToken: z.string().min(1).max(4000) });

export const createUploadBodySchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO", "VOICE"]),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  size: z.number().int().positive(),
  /** Required for visitors; agents authenticate with a bearer token. */
  visitorId: visitorIdSchema.optional(),
});

export const createMessageBodySchema = z
  .object({
  content: z.string().trim().max(4000, "Message is too long").default(""),
  attachment: messageAttachmentSchema.optional(),
  senderType: z.enum(["VISITOR", "AGENT"]),
  /** Required when senderType is VISITOR; agents authenticate with a bearer token. */
  visitorId: visitorIdSchema.optional(),
  /** Supplied by clients that queue offline, so a retry cannot duplicate. */
  clientId: clientIdSchema.optional(),
})
  .refine(withContentOrAttachment, EMPTY_MESSAGE);

/* --------------------------------- sockets --------------------------------- */

export const socketAuthSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("VISITOR"), visitorId: visitorIdSchema }),
  z.object({ role: z.literal("AGENT"), token: z.string().min(1) }),
  z.object({ role: z.literal("ADMIN"), token: z.string().min(1) }),
]);

export const socketJoinPayloadSchema = z.object({ conversationId: idSchema });

export const socketMessagePayloadSchema = z
  .object({
    conversationId: idSchema,
    content: z.string().trim().max(4000, "Message is too long").default(""),
    clientId: clientIdSchema.optional(),
    attachment: messageAttachmentSchema.optional(),
  })
  .refine(withContentOrAttachment, EMPTY_MESSAGE);

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
export type CreateUploadBody = z.infer<typeof createUploadBodySchema>;
export type SocketAuthInput = z.infer<typeof socketAuthSchema>;
export type CreateBranchBody = z.infer<typeof createBranchBodySchema>;
export type UpdateBranchBody = z.infer<typeof updateBranchBodySchema>;
export type CreateAgentBody = z.infer<typeof createAgentBodySchema>;
export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>;
export type ListAdminConversationsQuery = z.infer<typeof listAdminConversationsQuerySchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type LeadsTableQuery = z.infer<typeof leadsTableQuerySchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type UpdateAdminProfileBody = z.infer<typeof updateAdminProfileBodySchema>;
export type CreateAdminBody = z.infer<typeof createAdminBodySchema>;
export type UpdateAdminBody = z.infer<typeof updateAdminBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;
