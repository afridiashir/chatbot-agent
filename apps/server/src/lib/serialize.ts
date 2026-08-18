import type {
  AdminRow,
  AgentRow,
  BranchRow,
  ConversationRow,
  EnquiryRow,
  LeadRow,
  MessageRow,
  VisitorRow,
} from "@repo/db";
import type {
  Admin,
  Agent,
  AgentWithLoad,
  Branch,
  Conversation,
  ConversationDetail,
  Enquiry,
  Lead,
  ConversationSummary,
  ConversationWithAgent,
  Message,
  VisitorSummary,
} from "@repo/types";

/**
 * Prisma hands back `Date` objects; the wire format is ISO strings. Converting
 * in one place keeps every endpoint's payload identical in shape.
 */

export function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toEnquiry(row: EnquiryRow & { branch?: { name: string } | null }): Enquiry {
  return {
    id: row.id,
    leadId: row.leadId,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    conversationId: row.conversationId,
    answered: row.answered,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Totals derived from the enquiry history — never stored on the lead. */
export interface LeadStats {
  enquiryCount: number;
  missedCount: number;
  firstEnquiryAt: string | null;
  lastEnquiryAt: string | null;
}

/**
 * `stats` is required rather than optional: the counts have exactly one source
 * of truth, and passing it explicitly also stops `rows.map(toLead)` from
 * silently handing the array index to a second parameter.
 */
export function toLead(row: LeadRow & { branch?: { name: string } | null }, stats: LeadStats): Lead {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    ...stats,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Folds an already-loaded history into the same shape, for the single-lead view. */
export function statsFromEnquiries(
  history: Array<{ createdAt: Date; answered: boolean }>,
): LeadStats {
  const times = history.map((enquiry) => enquiry.createdAt.getTime());
  return {
    enquiryCount: history.length,
    missedCount: history.filter((enquiry) => !enquiry.answered).length,
    firstEnquiryAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastEnquiryAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

export function toAdmin(row: AdminRow): Admin {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    email: row.email,
    isOnline: row.isOnline,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAgentWithLoad(row: AgentRow, activeConversationCount: number): AgentWithLoad {
  return { ...toAgent(row), activeConversationCount };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType,
    content: row.content,
    clientId: row.clientId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toVisitorSummary(row: VisitorRow): VisitorSummary {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone };
}

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    agentId: row.agentId,
    visitorId: row.visitorId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

export function toConversationWithAgent(
  row: ConversationRow & { agent: AgentRow; visitor: VisitorRow },
): ConversationWithAgent {
  return {
    ...toConversation(row),
    agent: {
      id: row.agent.id,
      name: row.agent.name,
      branchId: row.agent.branchId,
      isOnline: row.agent.isOnline,
    },
    visitor: toVisitorSummary(row.visitor),
  };
}

export function toConversationDetail(
  row: ConversationRow & { agent: AgentRow; visitor: VisitorRow; messages: MessageRow[] },
): ConversationDetail {
  return {
    ...toConversationWithAgent(row),
    messages: row.messages.map(toMessage),
  };
}

export function toConversationSummary(
  row: ConversationRow & {
    visitor: VisitorRow;
    messages: MessageRow[];
    _count: { messages: number };
  },
): ConversationSummary {
  const [lastMessage] = row.messages;
  return {
    ...toConversation(row),
    visitor: toVisitorSummary(row.visitor),
    lastMessage: lastMessage ? toMessage(lastMessage) : null,
    messageCount: row._count.messages,
  };
}
