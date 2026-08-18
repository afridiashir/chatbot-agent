import { DUMMY_PASSWORD_HASH, hashPassword, prisma, verifyPassword } from "@repo/db";
import type {
  Admin,
  AdminConversationDetail,
  AdminConversationSummary,
  AdminLoginResult,
  AdminStats,
  Agent,
  Branch,
  DeactivateAgentResult,
  Lead,
  LeadDetail,
} from "@repo/types";
import type {
  CreateAgentBody,
  CreateBranchBody,
  ListAdminConversationsQuery,
  ListLeadsQuery,
  LoginBody,
  UpdateAgentBody,
  UpdateBranchBody,
} from "@repo/validation";
import type { Conversation } from "@repo/types";
import { conflict, notFound, unauthorized } from "../lib/http.js";
import type { AdminTokenPayload } from "../lib/auth.js";
import { signAdminToken } from "../lib/auth.js";
import {
  toAdmin,
  toAgent,
  toBranch,
  toConversation,
  toConversationDetail,
  toConversationSummary,
  toEnquiry,
  toLead,
  statsFromEnquiries,
  type LeadStats,
} from "../lib/serialize.js";

const MESSAGE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

/* ----------------------------------- auth ---------------------------------- */

export async function loginAdmin(input: LoginBody): Promise<AdminLoginResult> {
  const admin = await prisma.admin.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });

  const passwordOk = await verifyPassword(
    input.password,
    admin?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!admin || !passwordOk) throw unauthorized("Incorrect email or password");

  return {
    token: signAdminToken({ adminId: admin.id, companyId: admin.companyId }),
    admin: toAdmin(admin),
  };
}

export async function getAdmin(adminId: string): Promise<Admin> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw notFound("Admin not found");
  return toAdmin(admin);
}

/* --------------------------------- branches -------------------------------- */

export async function createBranch(
  input: CreateBranchBody,
  actor: AdminTokenPayload,
): Promise<Branch> {
  const duplicate = await prisma.branch.findFirst({
    where: { companyId: actor.companyId, name: input.name },
    select: { id: true },
  });
  if (duplicate) throw conflict("A branch with that name already exists");

  const branch = await prisma.branch.create({
    data: { companyId: actor.companyId, name: input.name },
  });
  return toBranch(branch);
}

/**
 * Rename and/or activate. Deactivating hides the branch from the widget and
 * from routing; its agents keep their existing conversations so nobody is cut
 * off mid-chat.
 */
export async function updateBranch(
  branchId: string,
  input: UpdateBranchBody,
  actor: AdminTokenPayload,
): Promise<Branch> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.companyId !== actor.companyId) throw notFound("Branch not found");

  if (input.name && input.name !== branch.name) {
    const duplicate = await prisma.branch.findFirst({
      where: { companyId: actor.companyId, name: input.name, id: { not: branchId } },
      select: { id: true },
    });
    if (duplicate) throw conflict("A branch with that name already exists");
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return toBranch(updated);
}

/* ---------------------------------- agents --------------------------------- */

async function assertBranchInCompany(branchId: string, companyId: string): Promise<void> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { companyId: true },
  });
  if (!branch || branch.companyId !== companyId) throw notFound("Branch not found");
}

export async function createAgent(
  input: CreateAgentBody,
  actor: AdminTokenPayload,
): Promise<Agent> {
  await assertBranchInCompany(input.branchId, actor.companyId);

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.agent.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict("An agent with that email already exists");

  const agent = await prisma.agent.create({
    data: {
      branchId: input.branchId,
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
      // New agents start offline so they choose when to take chats.
      isOnline: false,
    },
  });
  return toAgent(agent);
}

/**
 * Edit an agent. Deactivating is the soft delete: it forces them offline and
 * closes their open conversations, because a deactivated agent cannot answer
 * and leaving visitors waiting on a silent chat would be worse than ending it.
 */
export async function updateAgent(
  agentId: string,
  input: UpdateAgentBody,
  actor: AdminTokenPayload,
): Promise<DeactivateAgentResult & { closed: Conversation[] }> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { branch: { select: { companyId: true } } },
  });
  if (!agent || agent.branch.companyId !== actor.companyId) throw notFound("Agent not found");

  if (input.branchId) await assertBranchInCompany(input.branchId, actor.companyId);

  const email = input.email?.trim().toLowerCase();
  if (email && email !== agent.email) {
    const duplicate = await prisma.agent.findUnique({ where: { email }, select: { id: true } });
    if (duplicate) throw conflict("An agent with that email already exists");
  }

  const deactivating = input.isActive === false && agent.isActive;

  const [updated, closed] = await prisma.$transaction(async (tx) => {
    const next = await tx.agent.update({
      where: { id: agentId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
        ...(deactivating ? { isOnline: false } : {}),
      },
    });

    if (!deactivating) return [next, []] as const;

    // The ids are captured before the update so each closure can be broadcast —
    // visitors sitting in one of these chats must be told it ended.
    const open = await tx.conversation.findMany({
      where: { agentId, status: "ACTIVE" },
      select: { id: true },
    });
    if (open.length === 0) return [next, []] as const;

    const ids = open.map((row) => row.id);
    await tx.conversation.updateMany({
      where: { id: { in: ids } },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    const rows = await tx.conversation.findMany({ where: { id: { in: ids } } });
    return [next, rows] as const;
  });

  return {
    agent: toAgent(updated),
    closedConversations: closed.length,
    closed: closed.map(toConversation),
  };
}

/* ------------------------------- conversations ------------------------------ */

/** Company-wide conversation list, newest activity first. */
export async function listAllConversations(
  query: ListAdminConversationsQuery,
  actor: AdminTokenPayload,
): Promise<AdminConversationSummary[]> {
  const rows = await prisma.conversation.findMany({
    where: {
      agent: {
        ...(query.agentId ? { id: query.agentId } : {}),
        branch: {
          companyId: actor.companyId,
          ...(query.branchId ? { id: query.branchId } : {}),
        },
      },
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: query.limit,
    include: {
      agent: { include: { branch: { select: { id: true, name: true } } } },
      visitor: true,
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      _count: { select: { messages: true } },
    },
  });

  return rows.map((row) => ({
    ...toConversationSummary(row),
    agent: { id: row.agent.id, name: row.agent.name, branchId: row.agent.branchId },
    branch: { id: row.agent.branch.id, name: row.agent.branch.name },
  }));
}

/** Read-only transcript of any conversation in the company. */
export async function getAnyConversation(
  conversationId: string,
  actor: AdminTokenPayload,
): Promise<AdminConversationDetail> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      agent: { include: { branch: { select: { id: true, name: true, companyId: true } } } },
      visitor: true,
      messages: { orderBy: [...MESSAGE_ORDER] },
    },
  });

  if (!conversation || conversation.agent.branch.companyId !== actor.companyId) {
    throw notFound("Conversation not found");
  }

  return {
    ...toConversationDetail(conversation),
    branch: { id: conversation.agent.branch.id, name: conversation.agent.branch.name },
  };
}

/* ----------------------------------- leads --------------------------------- */

/**
 * Everyone who has submitted the pre-chat form. Ordered by most recent
 * activity, with the unanswered enquiries reachable through `missedOnly` —
 * that filter is the follow-up list.
 */
export async function listLeads(
  query: ListLeadsQuery,
  actor: AdminTokenPayload,
): Promise<Lead[]> {
  const search = query.search?.trim();

  const rows = await prisma.lead.findMany({
    where: {
      companyId: actor.companyId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      // "Missed" is a property of the history now, not a column.
      ...(query.missedOnly ? { enquiries: { some: { answered: false } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: query.limit,
    include: { branch: { select: { name: true } } },
  });

  if (rows.length === 0) return [];

  // Aggregate in the database rather than loading every enquiry: a long-lived
  // lead could have hundreds, and the list only needs the totals.
  const leadIds = rows.map((row) => row.id);
  const [totals, missed] = await Promise.all([
    prisma.enquiry.groupBy({
      by: ["leadId"],
      where: { leadId: { in: leadIds } },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.enquiry.groupBy({
      by: ["leadId"],
      where: { leadId: { in: leadIds }, answered: false },
      _count: { _all: true },
    }),
  ]);

  const totalsBy = new Map(totals.map((row) => [row.leadId, row]));
  const missedBy = new Map(missed.map((row) => [row.leadId, row._count._all]));

  return rows.map((row) => {
    const total = totalsBy.get(row.id);
    const stats: LeadStats = {
      enquiryCount: total?._count._all ?? 0,
      missedCount: missedBy.get(row.id) ?? 0,
      firstEnquiryAt: total?._min.createdAt?.toISOString() ?? null,
      lastEnquiryAt: total?._max.createdAt?.toISOString() ?? null,
    };
    return toLead(row, stats);
  });
}

/** One lead with its full history, newest first. */
export async function getLead(leadId: string, actor: AdminTokenPayload): Promise<LeadDetail> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      branch: { select: { name: true } },
      enquiries: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { branch: { select: { name: true } } },
      },
    },
  });

  if (!lead || lead.companyId !== actor.companyId) throw notFound("Lead not found");

  return {
    ...toLead(lead, statsFromEnquiries(lead.enquiries)),
    enquiries: lead.enquiries.map((enquiry) => toEnquiry(enquiry)),
  };
}

/* ---------------------------------- stats ---------------------------------- */

export async function getStats(actor: AdminTokenPayload): Promise<AdminStats> {
  const branchScope = { companyId: actor.companyId };
  const agentScope = { branch: branchScope };
  const conversationScope = { agent: agentScope };

  const [
    branches,
    activeBranches,
    agents,
    activeAgents,
    onlineAgents,
    active,
    closed,
    leads,
    missedLeads,
  ] = await Promise.all([
    prisma.branch.count({ where: branchScope }),
    prisma.branch.count({ where: { ...branchScope, isActive: true } }),
    prisma.agent.count({ where: agentScope }),
    prisma.agent.count({ where: { ...agentScope, isActive: true } }),
    prisma.agent.count({ where: { ...agentScope, isActive: true, isOnline: true } }),
    prisma.conversation.count({ where: { ...conversationScope, status: "ACTIVE" } }),
    prisma.conversation.count({ where: { ...conversationScope, status: "CLOSED" } }),
    prisma.lead.count({ where: { companyId: actor.companyId } }),
    prisma.lead.count({
      where: { companyId: actor.companyId, enquiries: { some: { answered: false } } },
    }),
  ]);

  return {
    branches: { total: branches, active: activeBranches },
    agents: { total: agents, active: activeAgents, online: onlineAgents },
    conversations: { active, closed },
    leads: { total: leads, missed: missedLeads },
  };
}
