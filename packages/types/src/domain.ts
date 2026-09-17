/**
 * Framework-free mirrors of the persisted models. These intentionally do not
 * import from `@repo/db` so that browser bundles never pull in Prisma.
 */

import type { AttachmentKind, MessageAttachment } from "./media";

export const ConversationStatus = {
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const SenderType = {
  VISITOR: "VISITOR",
  AGENT: "AGENT",
} as const;
export type SenderType = (typeof SenderType)[keyof typeof SenderType];

export interface Company {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  /** Soft delete: inactive branches are hidden from visitors and from routing. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Company-level operator. Has no branch, availability or conversations. */
export interface Admin {
  id: string;
  companyId: string;
  /** Null for a company admin; set for a branch admin, who sees only that branch. */
  branchId: string | null;
  branchName: string | null;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  branchId: string;
  name: string;
  email: string;
  /**
   * Profile photo as an API path (prefix the API origin), or null to show
   * initials. Public, because website visitors see it; changes with the photo.
   */
  avatarUrl: string | null;
  isOnline: boolean;
  /** Soft delete: inactive agents cannot sign in and are never routed to. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An agent plus its live workload, used by routing and the admin view. */
export interface AgentWithLoad extends Agent {
  activeConversationCount: number;
}

/** The person chatting, with the details they gave in the pre-chat form. */
export interface Visitor {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

/** What agents and admins are shown about a visitor. */
export type VisitorSummary = Pick<Visitor, "id" | "name" | "email" | "phone">;

/**
 * The message a reply quotes, as shown in the small block above it. Trimmed on
 * purpose: enough to recognise the message and jump to it, nothing more.
 */
export interface MessageQuote {
  id: string;
  senderType: SenderType;
  /** The text, or the caption of a media message. */
  content: string;
  /** Set when the quoted message carried media, for the "Photo" style label. */
  attachmentKind: AttachmentKind | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  /** The text, or the caption of a media message (then possibly empty). */
  content: string;
  /** Image, video, audio file or voice note sent with the message. */
  attachment: MessageAttachment | null;
  /** The earlier message this one replies to, or null. */
  replyTo: MessageQuote | null;
  /** Idempotency key from the sender, when it queued the message. */
  clientId: string | null;
  createdAt: string;
  /** The other side's app had it (two grey ticks); null until then. */
  deliveredAt: string | null;
  /** The other side had the chat open on screen (two blue ticks). */
  readAt: string | null;
}

/** One, two grey or two blue ticks, for a message the viewer sent. */
export type ReceiptStatus = "SENT" | "DELIVERED" | "READ";

export const receiptStatus = (message: Pick<Message, "deliveredAt" | "readAt">): ReceiptStatus =>
  message.readAt ? "READ" : message.deliveredAt ? "DELIVERED" : "SENT";

export interface Conversation {
  id: string;
  agentId: string;
  visitorId: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** Conversation enriched with the joined agent — what the widget/dashboard render. */
export interface ConversationWithAgent extends Conversation {
  agent: Pick<Agent, "id" | "name" | "branchId" | "isOnline" | "avatarUrl">;
  visitor: VisitorSummary;
}

export interface ConversationDetail extends ConversationWithAgent {
  messages: Message[];
}

/** A conversation row in the agent's inbox list. */
export interface ConversationSummary extends Conversation {
  visitor: VisitorSummary;
  lastMessage: Message | null;
  messageCount: number;
  /** Messages from the visitor the agent has not read yet. */
  unreadCount: number;
}

export interface BranchWithAgents extends Branch {
  agents: AgentWithLoad[];
}

/** A conversation row in the admin's company-wide list. */
export interface AdminConversationSummary extends ConversationSummary {
  agent: Pick<Agent, "id" | "name" | "branchId">;
  branch: Pick<Branch, "id" | "name">;
}

export interface AdminConversationDetail extends ConversationDetail {
  branch: Pick<Branch, "id" | "name">;
}

/**
 * A person who submitted the pre-chat form, deduplicated by email. Recorded
 * whether or not an agent was available.
 */
export interface Lead {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  branchId: string | null;
  branchName: string | null;
  /** Derived from the enquiry history, never stored, so it cannot drift. */
  enquiryCount: number;
  /** Of those, how many found nobody online. */
  missedCount: number;
  /** When they first got in touch, and most recently. */
  firstEnquiryAt: string | null;
  lastEnquiryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row of the leads table: the lead plus their most recent conversation. */
export interface LeadTableRow extends Lead {
  latestConversation: {
    id: string;
    status: ConversationStatus;
    agentId: string;
    agentName: string;
    updatedAt: string;
  } | null;
}

/** One page of the leads table, with the total across all pages. */
export interface LeadTablePage {
  rows: LeadTableRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** One approach from a lead — the unit of the history. */
export interface Enquiry {
  id: string;
  leadId: string;
  branchId: string | null;
  branchName: string | null;
  conversationId: string | null;
  /** False when nobody in that branch was online at the time. */
  answered: boolean;
  createdAt: string;
}

/** A lead with its full history, newest first. */
export interface LeadDetail extends Lead {
  enquiries: Enquiry[];
}

/** Grouped hits for the admin top-bar search. Each group is capped. */
export interface AdminSearchResults {
  agents: Array<{
    id: string;
    name: string;
    email: string;
    branchName: string;
    isOnline: boolean;
    isActive: boolean;
  }>;
  branches: Array<{ id: string; name: string; isActive: boolean; agentCount: number }>;
  leads: Array<{ id: string; name: string; email: string; phone: string }>;
  conversations: Array<{
    id: string;
    visitorName: string;
    visitorEmail: string;
    agentName: string;
    status: ConversationStatus;
    updatedAt: string;
  }>;
}

/** Counts shown on the admin landing page. */
export interface AdminStats {
  branches: { total: number; active: number };
  agents: { total: number; active: number; online: number };
  conversations: { active: number; closed: number };
  /** `missed` counts people whose enquiry never reached an agent. */
  leads: { total: number; missed: number };
}

/** One local calendar day of activity. `date` is `YYYY-MM-DD` in the viewer's zone. */
export interface AnalyticsDay {
  date: string;
  conversations: number;
  messages: number;
  /** Enquiries that opened a chat. */
  answered: number;
  /** Enquiries that found nobody online. */
  missed: number;
}

export interface AnalyticsHour {
  hour: number;
  conversations: number;
  answered: number;
  missed: number;
}

export interface AnalyticsBranch {
  branchId: string;
  name: string;
  isActive: boolean;
  conversations: number;
  answered: number;
  missed: number;
}

export interface AnalyticsAgent {
  agentId: string;
  name: string;
  branchName: string;
  isOnline: boolean;
  /** Open right now, regardless of the selected range. */
  activeNow: number;
  /** Conversations assigned within the selected range. */
  handled: number;
}

/** Everything the admin overview charts, for one date range. */
export interface AdminAnalytics {
  range: { days: number; timeZone: string; from: string; to: string };
  totals: {
    conversations: number;
    messages: number;
    answered: number;
    missed: number;
    /** Median seconds from a visitor's first message to the first agent reply. */
    medianFirstResponseSeconds: number | null;
  };
  /** The same totals for the equally long period just before, for deltas. */
  previous: { conversations: number; answered: number; missed: number };
  daily: AnalyticsDay[];
  /** Activity in each local hour of the day, 24 entries from hour 0. */
  hourly: AnalyticsHour[];
  branches: AnalyticsBranch[];
  agents: AnalyticsAgent[];
}
