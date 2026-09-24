import { z } from "zod";
import { LABEL_COLORS, MARITAL_STATUSES, PAKISTAN_CITIES, phoneProblem } from "@repo/types";
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
export const labelIdParamSchema = z.object({ labelId: idSchema });
export const conversationLabelParamSchema = z.object({
  conversationId: idSchema,
  labelId: idSchema,
});

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
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
    /**
     * Only ever `true`. There is no "unset the main branch": a company must
     * always have somewhere to route to, so you make a *different* branch main
     * instead, which moves the flag. Typing it as a literal makes the invalid
     * request unrepresentable rather than something the service has to refuse.
     */
    isMain: z.literal(true).optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.isActive !== undefined || body.isMain !== undefined,
    { message: "Provide something to change" },
  );

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
  /** Only chats carrying this label. */
  labelId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** POST /api/admin/conversations/:id/transfer — who takes the chat over. */
export const transferConversationBodySchema = z.object({ agentId: idSchema });

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

/* ---------------------------------- labels --------------------------------- */

const labelNameSchema = z
  .string()
  .trim()
  .min(1, "Give the label a name")
  .max(32, "Keep the label short");

export const createLabelBodySchema = z.object({
  name: labelNameSchema,
  color: z.enum(LABEL_COLORS).default("grey"),
});

export const updateLabelBodySchema = z
  .object({ name: labelNameSchema.optional(), color: z.enum(LABEL_COLORS).optional() })
  .refine((body) => body.name !== undefined || body.color !== undefined, {
    message: "Provide something to change",
  });

/** Columns the leads table can be ordered by. */
export const LEAD_SORTS = [
  "name",
  "phone",
  "city",
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
    /** Both from the pre-chat form, so both are filterable in the table. */
    city: z.enum(PAKISTAN_CITIES as [string, ...string[]]).optional(),
    maritalStatus: z.enum(MARITAL_STATUSES).optional(),
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
 * A phone number, checked by the rule the widget shows its own errors from, so
 * the form and the API cannot disagree about what a number is.
 *
 * It is the identity a visitor is found by now — it decides which chats they
 * are shown — which is why it is no longer merely "looks like a number".
 */
export const phoneSchema = z
  .string()
  .trim()
  .max(24, "That number looks too long")
  .superRefine((value, ctx) => {
    const problem = phoneProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/**
 * Collected by the widget's pre-chat form.
 *
 * Marital status and city are closed sets rather than free text: they exist to
 * be filtered and grouped in the admin, which only works if everyone picking
 * "Lahore" writes it the same way. The lists live in `@repo/types` so the
 * widget renders exactly what the server will accept.
 */
export const visitorDetailsSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80, "That name is too long"),
  phone: phoneSchema,
  maritalStatus: z.enum(MARITAL_STATUSES, { message: "Choose your marital status" }),
  city: z.enum(PAKISTAN_CITIES as [string, ...string[]], { message: "Choose your city" }),
});

/* ------------------------------- conversations ------------------------------ */

/**
 * Neither target is required. The visitor is no longer asked to choose a
 * branch, so a plain widget sends neither and the server routes to the
 * company's main branch; a branch link sends `branchId`, and an agent link
 * sends `agentId`.
 */
export const createConversationBodySchema = z.object({
  /** From a branch's chat link or embed. */
  branchId: idSchema.optional(),
  /** From an agent's personal chat link: the chat goes to this agent, online or not. */
  agentId: idSchema.optional(),
  visitorId: visitorIdSchema,
  /** Contact details from the pre-chat form. */
  visitor: visitorDetailsSchema,
  /** Optional opening message so the agent sees intent immediately. */
  initialMessage: messageContentSchema.optional(),
});

/**
 * POST /api/conversations/lookup — "these are my chats".
 *
 * A POST rather than a GET because the phone number is the body of the
 * request, not a thing to leave in a URL, a proxy log or a browser history.
 * `visitorId` is this browser, which the lookup binds to the number so the
 * chats it returns can then actually be opened from here.
 */
export const lookupConversationsBodySchema = z.object({
  phone: phoneSchema,
  visitorId: visitorIdSchema,
  /** The link the widget was opened from, which says whose company to search. */
  branchId: idSchema.optional(),
  agentId: idSchema.optional(),
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
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),
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
    /** Quotes an earlier message of the same conversation. */
    replyToId: idSchema.optional(),
  })
  .refine(withContentOrAttachment, EMPTY_MESSAGE);

/* ---------------------------------- push ----------------------------------- */

/** What `PushManager.subscribe()` hands back, trimmed to what is stored. */
export const pushSubscriptionBodySchema = z.object({
  subscription: z.object({
    endpoint: z.url("endpoint must be a URL").max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
  visitorId: visitorIdSchema,
});

/** The agent's own browser; the agent itself comes from the bearer token. */
export const agentPushSubscriptionBodySchema = z.object({
  subscription: z.object({
    endpoint: z.url("endpoint must be a URL").max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
});

export const unsubscribeBodySchema = z.object({
  endpoint: z.url("endpoint must be a URL").max(2048),
});

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
    /** Quotes an earlier message of this conversation. */
    replyToId: idSchema.optional(),
  })
  .refine(withContentOrAttachment, EMPTY_MESSAGE);

/**
 * One emoji, or null to take the reaction back. Capped at a few code points:
 * an emoji with a skin tone and a zero-width joiner is still short, while a
 * pasted sentence is not a reaction.
 */
export const socketReactionPayloadSchema = z.object({
  conversationId: idSchema,
  messageId: idSchema,
  emoji: z.string().trim().min(1).max(16).nullable(),
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
export type CreateUploadBody = z.infer<typeof createUploadBodySchema>;
export type LookupConversationsBody = z.infer<typeof lookupConversationsBodySchema>;
export type SocketAuthInput = z.infer<typeof socketAuthSchema>;
export type SocketReactionPayload = z.infer<typeof socketReactionPayloadSchema>;
export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBodySchema>;
export type TransferConversationBody = z.infer<typeof transferConversationBodySchema>;
export type CreateLabelBody = z.infer<typeof createLabelBodySchema>;
export type UpdateLabelBody = z.infer<typeof updateLabelBodySchema>;
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
