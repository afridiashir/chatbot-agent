import { mediaPath } from "./media-link.js";
import type {
  AdminRow,
  AttachmentRow,
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
export function toLead(
  row: LeadRow & { branch?: { name: string } | null },
  stats: LeadStats,
): Lead {
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

export function toAdmin(row: AdminRow & { branch?: { name: string } | null }): Admin {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Public photo path. The version is the random part of the object key, so a
 * new photo is a new URL and browsers can cache each one indefinitely.
 */
export function avatarPath(row: Pick<AgentRow, "id" | "avatarKey">): string | null {
  const version = row.avatarKey?.match(/\/([^/]+)\.[a-z]+$/)?.[1];
  return version ? `/api/avatars/${row.id}/${version}` : null;
}

export function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    email: row.email,
    avatarUrl: avatarPath(row),
    isOnline: row.isOnline,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAgentWithLoad(row: AgentRow, activeConversationCount: number): AgentWithLoad {
  return { ...toAgent(row), activeConversationCount };
}

/** Every message query includes its attachment, so the payload is complete. */
export const MESSAGE_INCLUDE = {
  attachment: true,
  // Just enough of the quoted message to render the reply block.
  replyTo: {
    select: {
      id: true,
      senderType: true,
      content: true,
      attachment: { select: { kind: true } },
    },
  },
} as const;

/** What MESSAGE_INCLUDE loads alongside the message row. */
type QuotedRow = Pick<MessageRow, "id" | "senderType" | "content"> & {
  attachment: { kind: AttachmentRow["kind"] } | null;
};

export function toMessage(
  row: MessageRow & { attachment?: AttachmentRow | null; replyTo?: QuotedRow | null },
): Message {
  const attachment = row.attachment;
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType,
    content: row.content,
    attachment: attachment
      ? {
          id: attachment.id,
          kind: attachment.kind,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          size: attachment.size,
          durationMs: attachment.durationMs,
          waveform: attachment.waveform,
          url: mediaPath(attachment.id),
        }
      : null,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          senderType: row.replyTo.senderType,
          content: row.replyTo.content,
          attachmentKind: row.replyTo.attachment?.kind ?? null,
        }
      : null,
    clientId: row.clientId,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
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
      avatarUrl: avatarPath(row.agent),
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
