/**
 * Framework-free mirrors of the persisted models. These intentionally do not
 * import from `@repo/db` so that browser bundles never pull in Prisma.
 */

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
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  branchId: string;
  name: string;
  email: string;
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

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  content: string;
  /** Idempotency key from the sender, when it queued the message. */
  clientId: string | null;
  createdAt: string;
}

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
  agent: Pick<Agent, "id" | "name" | "branchId" | "isOnline">;
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
  /** Times they have started, or tried to start, a chat. */
  enquiryCount: number;
  /** Of those, how many found nobody online. */
  missedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Counts shown on the admin landing page. */
export interface AdminStats {
  branches: { total: number; active: number };
  agents: { total: number; active: number; online: number };
  conversations: { active: number; closed: number };
  /** `missed` counts people whose enquiry never reached an agent. */
  leads: { total: number; missed: number };
}
