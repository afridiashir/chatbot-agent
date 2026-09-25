import { DUMMY_PASSWORD_HASH, hashPassword, Prisma, prisma, verifyPassword } from "@repo/db";
import type {
  Admin,
  AdminConversationDetail,
  AdminConversationSummary,
  AdminLoginResult,
  AdminSearchResults,
  AdminStats,
  Agent,
  Branch,
  ConversationTransfer,
  ConversationWithAgent,
  DeactivateAgentResult,
  DeleteConversationResult,
  DeleteMessageResult,
  Lead,
  LeadDetail,
  LeadTablePage,
  MaritalStatus,
} from "@repo/types";
import type {
  AdminSearchQuery,
  ChangePasswordBody,
  CreateAdminBody,
  UpdateAdminBody,
  UpdateAdminProfileBody,
  CreateAgentBody,
  CreateBranchBody,
  ListAdminConversationsQuery,
  ListLeadsQuery,
  LeadsTableQuery,
  LoginBody,
  UpdateAgentBody,
  UpdateBranchBody,
} from "@repo/validation";
import type { Conversation } from "@repo/types";
import { conflict, forbidden, HttpError, notFound, unauthorized } from "../lib/http.js";
import {
  assertBranchAllowed,
  branchScope,
  requireCompanyAdmin,
  sqlInBranch,
} from "../lib/admin-scope.js";
import type { AdminTokenPayload } from "../lib/auth.js";
import { signAdminToken } from "../lib/auth.js";
import { deleteObject } from "../lib/storage.js";
import { adminAuthors, unreadCounts } from "./conversations.js";
import {
  toAdmin,
  toAgent,
  toBranch,
  toConversation,
  toConversationDetail,
  toConversationWithAgent,
  toConversationSummary,
  toEnquiry,
  toLabelRefs,
  LABEL_INCLUDE,
  toLead,
  MESSAGE_INCLUDE,
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

  // Checked after the password, as for agents, so a deactivated account cannot
  // be identified without its credentials.
  if (!admin.isActive) {
    throw unauthorized("This account has been deactivated. Contact your company admin.");
  }

  const branch = admin.branchId
    ? await prisma.branch.findUnique({ where: { id: admin.branchId }, select: { name: true } })
    : null;

  return {
    token: signAdminToken({
      adminId: admin.id,
      companyId: admin.companyId,
      branchId: admin.branchId,
    }),
    admin: toAdmin({ ...admin, branch }),
  };
}

const ADMIN_BRANCH = { branch: { select: { name: true } } } as const;

export async function getAdmin(adminId: string): Promise<Admin> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, include: ADMIN_BRANCH });
  if (!admin) throw notFound("Admin not found");
  return toAdmin(admin);
}

export async function updateAdminProfile(
  input: UpdateAdminProfileBody,
  actor: AdminTokenPayload,
): Promise<Admin> {
  const admin = await prisma.admin.update({
    where: { id: actor.adminId },
    data: { name: input.name },
    include: ADMIN_BRANCH,
  });
  return toAdmin(admin);
}

/**
 * Requires the current password even though the caller holds a valid token, so
 * an unattended signed-in browser cannot be used to take over the account.
 */
export async function changeAdminPassword(
  input: ChangePasswordBody,
  actor: AdminTokenPayload,
): Promise<void> {
  const admin = await prisma.admin.findUnique({ where: { id: actor.adminId } });
  if (!admin) throw notFound("Admin not found");

  if (!(await verifyPassword(input.currentPassword, admin.passwordHash))) {
    // 400 rather than 401: the session is fine, only this field is wrong, and
    // a 401 would read to the client as "signed out".
    throw new HttpError(400, "VALIDATION_ERROR", "Current password is incorrect", {
      currentPassword: ["Current password is incorrect"],
    });
  }

  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
}

/* ------------------------------ admin accounts ----------------------------- */

/** Every admin in the company, company admins first. Company admins only. */
export async function listAdmins(actor: AdminTokenPayload): Promise<Admin[]> {
  requireCompanyAdmin(actor);
  const rows = await prisma.admin.findMany({
    where: { companyId: actor.companyId },
    include: ADMIN_BRANCH,
    orderBy: [{ isActive: "desc" }, { branchId: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  return rows.map(toAdmin);
}

async function assertBranchInCompanyForAdmin(branchId: string, companyId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.companyId !== companyId) throw notFound("Branch not found");
}

export async function createAdmin(
  input: CreateAdminBody,
  actor: AdminTokenPayload,
): Promise<Admin> {
  requireCompanyAdmin(actor);
  if (input.branchId) await assertBranchInCompanyForAdmin(input.branchId, actor.companyId);

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.admin.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict("An admin with that email already exists");

  const admin = await prisma.admin.create({
    data: {
      companyId: actor.companyId,
      branchId: input.branchId,
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
    },
    include: ADMIN_BRANCH,
  });
  return toAdmin(admin);
}

/**
 * Edit, move between company and branch scope, reset a password, deactivate.
 *
 * Two guards keep a company from locking itself out: nobody can deactivate or
 * re-scope their own account, and the last active company admin can be neither
 * deactivated nor narrowed to a branch.
 */
export async function updateAdmin(
  adminId: string,
  input: UpdateAdminBody,
  actor: AdminTokenPayload,
): Promise<Admin> {
  requireCompanyAdmin(actor);

  const target = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!target || target.companyId !== actor.companyId) throw notFound("Admin not found");

  const isSelf = target.id === actor.adminId;
  if (isSelf && input.isActive === false) throw forbidden("You cannot deactivate your own account");
  if (isSelf && input.branchId !== undefined && input.branchId !== target.branchId) {
    throw forbidden("You cannot change your own access level");
  }

  if (input.branchId) await assertBranchInCompanyForAdmin(input.branchId, actor.companyId);

  const losesCompanyScope =
    target.branchId === null &&
    target.isActive &&
    (input.isActive === false || (input.branchId !== undefined && input.branchId !== null));
  if (losesCompanyScope) {
    const others = await prisma.admin.count({
      where: { companyId: actor.companyId, branchId: null, isActive: true, id: { not: target.id } },
    });
    if (others === 0) throw conflict("A company must keep at least one active company admin");
  }

  const email = input.email?.trim().toLowerCase();
  if (email && email !== target.email) {
    const duplicate = await prisma.admin.findUnique({ where: { email }, select: { id: true } });
    if (duplicate) throw conflict("An admin with that email already exists");
  }

  const admin = await prisma.admin.update({
    where: { id: adminId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    include: ADMIN_BRANCH,
  });
  return toAdmin(admin);
}

/* ---------------------------------- search --------------------------------- */

const SEARCH_LIMIT = 5;

/** One box, every kind of record an admin looks things up by. */
export async function searchAdmin(
  query: AdminSearchQuery,
  actor: AdminTokenPayload,
): Promise<AdminSearchResults> {
  const contains = { contains: query.q, mode: "insensitive" as const };
  const companyBranch = branchScope(actor);

  const [agents, branches, leads, conversations] = await Promise.all([
    prisma.agent.findMany({
      where: { branch: companyBranch, OR: [{ name: contains }, { email: contains }] },
      include: { branch: { select: { name: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: SEARCH_LIMIT,
    }),
    prisma.branch.findMany({
      where: { ...companyBranch, name: contains },
      include: { _count: { select: { agents: { where: { isActive: true } } } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: SEARCH_LIMIT,
    }),
    prisma.lead.findMany({
      where: {
        companyId: actor.companyId,
        // A branch admin finds only people who got in touch with their branch.
        ...(actor.branchId ? { enquiries: { some: { branchId: actor.branchId } } } : {}),
        OR: [{ name: contains }, { city: contains }, { phone: { contains: query.q } }],
      },
      orderBy: { updatedAt: "desc" },
      take: SEARCH_LIMIT,
    }),
    prisma.conversation.findMany({
      where: {
        agent: { branch: companyBranch },
        visitor: {
          OR: [{ name: contains }, { city: contains }, { phone: { contains: query.q } }],
        },
      },
      include: {
        visitor: { select: { name: true, phone: true } },
        agent: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: SEARCH_LIMIT,
    }),
  ]);

  return {
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      branchName: agent.branch.name,
      isOnline: agent.isOnline,
      isActive: agent.isActive,
    })),
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      isActive: branch.isActive,
      agentCount: branch._count.agents,
    })),
    leads: leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
    })),
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      visitorName: conversation.visitor.name,
      visitorPhone: conversation.visitor.phone,
      agentName: conversation.agent.name,
      status: conversation.status,
      updatedAt: conversation.updatedAt.toISOString(),
    })),
  };
}

/* --------------------------------- branches -------------------------------- */

export async function createBranch(
  input: CreateBranchBody,
  actor: AdminTokenPayload,
): Promise<Branch> {
  requireCompanyAdmin(actor);
  const duplicate = await prisma.branch.findFirst({
    where: { companyId: actor.companyId, name: input.name },
    select: { id: true },
  });
  if (duplicate) throw conflict("A branch with that name already exists");

  // The first branch a company ever creates becomes its main branch. Without
  // this a fresh company would have nowhere to route walk-in chats to until
  // someone remembered to set it, and the failure would only show up when a
  // real visitor tried to start a chat.
  const existing = await prisma.branch.count({ where: { companyId: actor.companyId } });

  const branch = await prisma.branch.create({
    data: { companyId: actor.companyId, name: input.name, isMain: existing === 0 },
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
  requireCompanyAdmin(actor);
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.companyId !== actor.companyId) throw notFound("Branch not found");

  if (input.name && input.name !== branch.name) {
    const duplicate = await prisma.branch.findFirst({
      where: { companyId: actor.companyId, name: input.name, id: { not: branchId } },
      select: { id: true },
    });
    if (duplicate) throw conflict("A branch with that name already exists");
  }

  // Deactivating the main branch would leave every chat that arrives without a
  // link with nowhere to go, so it is refused rather than silently breaking the
  // widget. Making another branch main first moves the flag and clears the way.
  if (input.isActive === false && branch.isMain) {
    throw conflict("This is the main branch. Make another branch the main branch first.");
  }
  // A deactivated branch is invisible to visitors, so pointing walk-in traffic
  // at one would route every such chat into a branch nobody is watching.
  if (input.isMain && !(input.isActive ?? branch.isActive)) {
    throw conflict("Reactivate this branch before making it the main branch");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isMain) {
      // Cleared first: the partial unique index allows only one main branch per
      // company, so setting the new one before clearing the old would fail.
      await tx.branch.updateMany({
        where: { companyId: actor.companyId, isMain: true, id: { not: branchId } },
        data: { isMain: false },
      });
    }
    return tx.branch.update({
      where: { id: branchId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isMain !== undefined ? { isMain: input.isMain } : {}),
      },
    });
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
  assertBranchAllowed(actor, input.branchId);
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
  // A branch admin manages their own agents, and cannot move one elsewhere.
  if (actor.branchId && agent.branchId !== actor.branchId) throw notFound("Agent not found");

  if (input.branchId) {
    assertBranchAllowed(actor, input.branchId);
    await assertBranchInCompany(input.branchId, actor.companyId);
  }

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
        // AND, not a spread: a branch admin asking for another branch gets
        // nothing, rather than their requested id overriding their scope.
        branch: { AND: [branchScope(actor), query.branchId ? { id: query.branchId } : {}] },
      },
      ...(query.status ? { status: query.status } : {}),
      // A chat carries several labels, so this asks "is this one among them".
      ...(query.labelId ? { labels: { some: { labelId: query.labelId } } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: query.limit,
    include: {
      agent: { include: { branch: { select: { id: true, name: true } } } },
      visitor: true,
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        include: MESSAGE_INCLUDE,
      },
      ...LABEL_INCLUDE,
      _count: { select: { messages: true } },
    },
  });

  const unread = await unreadCounts(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...toConversationSummary(row, unread.get(row.id) ?? 0),
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
      messages: { orderBy: [...MESSAGE_ORDER], include: MESSAGE_INCLUDE },
      ...LABEL_INCLUDE,
    },
  });

  if (
    !conversation ||
    conversation.agent.branch.companyId !== actor.companyId ||
    (actor.branchId !== null && conversation.agent.branch.id !== actor.branchId)
  ) {
    throw notFound("Conversation not found");
  }

  return {
    ...toConversationDetail(conversation, true),
    branch: { id: conversation.agent.branch.id, name: conversation.agent.branch.name },
    labels: toLabelRefs(conversation.labels),
    // Always present here: this shape only ever reaches an admin.
    adminAuthored: await adminAuthors(conversation.messages),
  };
}

/**
 * The agent a chat is being handed to, checked against what this admin may
 * touch. Out of reach reads as missing, like every other admin lookup, so one
 * branch cannot discover another's agents by trying to transfer to them.
 */
async function transferTarget(agentId: string, actor: AdminTokenPayload) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      isActive: true,
      branchId: true,
      branch: { select: { id: true, name: true, companyId: true, isActive: true } },
    },
  });

  if (
    !agent ||
    agent.branch.companyId !== actor.companyId ||
    (actor.branchId !== null && agent.branchId !== actor.branchId)
  ) {
    throw notFound("Agent not found");
  }
  // Soft-deleted either way: routing already skips them, and a chat handed to
  // one would sit in an inbox nobody opens.
  if (!agent.isActive || !agent.branch.isActive) {
    throw conflict("That agent is no longer taking chats");
  }
  return agent;
}

/**
 * Hands an open chat to another agent.
 *
 * The visitor is not asked and is never told an admin did it: their header
 * simply switches to whoever is answering now, exactly as it would have if
 * routing had picked that person to begin with. The transcript stays where it
 * is — this changes who owns the chat, not what was said in it.
 *
 * A company admin may hand a chat across branches, which moves the chat itself
 * to the new agent's branch. That is the point of the option rather than a side
 * effect of it: when someone has reached the wrong desk, no amount of replying
 * from the old one puts them at the right one.
 *
 * The new agent's availability is deliberately not checked, matching an agent's
 * personal link: the chat waits in their inbox until they are back, which is
 * better than refusing to move it off someone who has gone home.
 */
export async function transferConversation(
  conversationId: string,
  agentId: string,
  actor: AdminTokenPayload,
): Promise<{
  transfer: ConversationTransfer;
  conversation: ConversationWithAgent;
  previous: { agentId: string; branchId: string };
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      agentId: true,
      status: true,
      agent: { select: { branchId: true, branch: { select: { companyId: true } } } },
    },
  });

  // The same scope, and the same answer, as reading or deleting one.
  if (
    !conversation ||
    conversation.agent.branch.companyId !== actor.companyId ||
    (actor.branchId !== null && conversation.agent.branchId !== actor.branchId)
  ) {
    throw notFound("Conversation not found");
  }
  // Who answered a finished chat is history now, and rewriting it would move
  // the row into an inbox where nobody can act on it.
  if (conversation.status !== "ACTIVE") {
    throw conflict("A closed conversation cannot be handed over");
  }
  if (conversation.agentId === agentId) {
    throw conflict("That agent already has this conversation");
  }

  const target = await transferTarget(agentId, actor);

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { agentId: target.id },
    include: { agent: true, visitor: true },
  });

  const withAgent = toConversationWithAgent(updated);
  return {
    conversation: withAgent,
    transfer: {
      conversationId,
      agent: withAgent.agent,
      branch: { id: target.branch.id, name: target.branch.name },
    },
    previous: { agentId: conversation.agentId, branchId: conversation.agent.branchId },
  };
}

/**
 * Wipes one conversation: its messages, their attachments and any reactions.
 * Deliberately a hard delete — this is the answer to "remove that chat", so
 * leaving a hidden copy behind would defeat the point of having the option.
 *
 * What survives is the lead's enquiry, whose `conversationId` is nulled rather
 * than cascaded (see the schema). Removing a transcript must not rewrite the
 * record that someone got in touch.
 */
export async function deleteConversation(
  conversationId: string,
  actor: AdminTokenPayload,
): Promise<DeleteConversationResult & { agentId: string }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      agentId: true,
      agent: { select: { branchId: true, branch: { select: { companyId: true } } } },
      messages: { select: { attachment: { select: { key: true } } } },
    },
  });

  // Same scope as reading one, and the same answer when it is out of reach, so
  // another branch's chats cannot be probed by trying to delete them.
  if (
    !conversation ||
    conversation.agent.branch.companyId !== actor.companyId ||
    (actor.branchId !== null && conversation.agent.branchId !== actor.branchId)
  ) {
    throw notFound("Conversation not found");
  }

  const keys = conversation.messages.flatMap((message) =>
    message.attachment ? [message.attachment.key] : [],
  );

  await prisma.conversation.delete({ where: { id: conversationId } });

  // Only once the rows are gone. An object with no row left is wasted space; a
  // row pointing at a missing object would be a broken chat on screen.
  await Promise.all(keys.map((key) => deleteObject(key)));

  return {
    id: conversationId,
    agentId: conversation.agentId,
    deletedMessages: conversation.messages.length,
    deletedAttachments: keys.length,
  };
}

/**
 * Removes one message, permanently.
 *
 * The smaller sibling of deleting the whole conversation, and deliberately as
 * final: the reason to reach for this is that something is in the chat which
 * must not be — a bank detail typed into the wrong window, a photo meant for
 * somebody else — and a tombstone saying "this message was deleted" would
 * leave the fact of it behind while helping nobody.
 *
 * Scoped exactly like deleting the conversation it belongs to. An admin who
 * can already remove the entire chat is not being handed anything new by being
 * able to remove one line of it.
 *
 * What the database does around it: a reply quoting this message keeps its own
 * text and loses the quote (`SetNull`), and reactions go with it (`Cascade`).
 */
export async function deleteMessage(
  conversationId: string,
  messageId: string,
  actor: AdminTokenPayload,
): Promise<DeleteMessageResult & { agentId: string }> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      attachment: { select: { key: true } },
      conversation: {
        select: {
          agentId: true,
          agent: { select: { branchId: true, branch: { select: { companyId: true } } } },
        },
      },
    },
  });

  // Out of reach, in the wrong conversation, or gone already: all the same
  // answer, so neither message ids nor other branches' chats can be probed.
  if (
    !message ||
    message.conversationId !== conversationId ||
    message.conversation.agent.branch.companyId !== actor.companyId ||
    (actor.branchId !== null && message.conversation.agent.branchId !== actor.branchId)
  ) {
    throw notFound("Message not found");
  }

  await prisma.message.delete({ where: { id: messageId } });

  // Only once the row is gone: an object with no row left is wasted space,
  // whereas a row pointing at a missing object is a broken bubble on screen.
  if (message.attachment) await deleteObject(message.attachment.key);

  return {
    id: messageId,
    conversationId,
    agentId: message.conversation.agentId,
    deletedAttachment: Boolean(message.attachment),
  };
}

/* ----------------------------------- leads --------------------------------- */

/**
 * Everyone who has submitted the pre-chat form. Ordered by most recent
 * activity, with the unanswered enquiries reachable through `missedOnly` —
 * that filter is the follow-up list.
 */
export async function listLeads(query: ListLeadsQuery, actor: AdminTokenPayload): Promise<Lead[]> {
  const search = query.search?.trim();

  const rows = await prisma.lead.findMany({
    where: {
      companyId: actor.companyId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      AND: [
        // "Missed" is a property of the history now, not a column.
        query.missedOnly
          ? {
              enquiries: {
                some: { answered: false, ...(actor.branchId ? { branchId: actor.branchId } : {}) },
              },
            }
          : {},
        actor.branchId ? { enquiries: { some: { branchId: actor.branchId } } } : {},
      ],
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
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
      where: { leadId: { in: leadIds }, ...(actor.branchId ? { branchId: actor.branchId } : {}) },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.enquiry.groupBy({
      by: ["leadId"],
      where: {
        leadId: { in: leadIds },
        answered: false,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
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

/**
 * Whitelisted ORDER BY expressions. The sort key is validated against LEAD_SORTS
 * already; mapping it here as well means no request value ever reaches SQL text.
 */
const LEAD_ORDER: Record<LeadsTableQuery["sort"], Prisma.Sql> = {
  name: Prisma.sql`lower(l."name")`,
  phone: Prisma.sql`l."phoneKey"`,
  city: Prisma.sql`lower(l."city")`,
  branch: Prisma.sql`lower(b."name")`,
  enquiries: Prisma.sql`s.enquiry_count`,
  missed: Prisma.sql`s.missed_count`,
  firstEnquiryAt: Prisma.sql`s.first_at`,
  lastEnquiryAt: Prisma.sql`s.last_at`,
};

/** `%` and `_` in a search are literal characters, not wildcards. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * The leads table: every filter, sort and page in one query. The counts are
 * derived from enquiries in the same statement, so a filter like "returning"
 * or a sort by "missed" is exact rather than approximated from a page.
 */
export async function listLeadsTable(
  query: LeadsTableQuery,
  actor: AdminTokenPayload,
): Promise<LeadTablePage> {
  const where: Prisma.Sql[] = [Prisma.sql`l."companyId" = ${actor.companyId}`];

  const search = query.search?.trim();
  if (search) {
    const pattern = likePattern(search);
    where.push(
      Prisma.sql`(l."name" ILIKE ${pattern} OR l."city" ILIKE ${pattern} OR l."phone" LIKE ${pattern})`,
    );
  }
  if (query.branchId) where.push(Prisma.sql`l."branchId" = ${query.branchId}`);
  // A branch admin sees the people who got in touch with their branch, and the
  // counts below only include those enquiries.
  if (actor.branchId) where.push(Prisma.sql`s.enquiry_count > 0`);
  const enquiryInBranch = (alias: string) => sqlInBranch(actor, Prisma.raw(`${alias}."branchId"`));
  if (query.outcome === "missed") where.push(Prisma.sql`s.missed_count > 0`);
  if (query.outcome === "answered") {
    where.push(Prisma.sql`s.missed_count = 0 AND s.enquiry_count > 0`);
  }
  if (query.visits === "new") where.push(Prisma.sql`s.enquiry_count = 1`);
  if (query.visits === "returning") where.push(Prisma.sql`s.enquiry_count > 1`);
  if (query.city) where.push(Prisma.sql`l."city" = ${query.city}`);
  if (query.maritalStatus) {
    where.push(Prisma.sql`l."maritalStatus" = ${query.maritalStatus}::"MaritalStatus"`);
  }
  if (query.conversation === "open") where.push(Prisma.sql`latest.status = 'ACTIVE'`);
  if (query.conversation === "closed") where.push(Prisma.sql`latest.status = 'CLOSED'`);
  if (query.conversation === "none") where.push(Prisma.sql`latest.conversation_id IS NULL`);
  if (query.agentId) {
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Enquiry" ea
      JOIN "Conversation" ca ON ca."id" = ea."conversationId"
      WHERE ea."leadId" = l."id" AND ca."agentId" = ${query.agentId} ${enquiryInBranch("ea")}
    )`);
  }
  if (query.from || query.to) {
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Enquiry" ed
      WHERE ed."leadId" = l."id" ${enquiryInBranch("ed")}
        ${query.from ? Prisma.sql`AND ed."createdAt" >= ${new Date(query.from)}` : Prisma.empty}
        ${query.to ? Prisma.sql`AND ed."createdAt" < ${new Date(query.to)}` : Prisma.empty}
    )`);
  }

  const direction = query.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const offset = (query.page - 1) * query.pageSize;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      companyId: string;
      name: string;
      phone: string;
      phoneKey: string;
      maritalStatus: MaritalStatus | null;
      city: string | null;
      branchId: string | null;
      branchName: string | null;
      createdAt: Date;
      updatedAt: Date;
      enquiry_count: number;
      missed_count: number;
      first_at: Date | null;
      last_at: Date | null;
      conversation_id: string | null;
      conversation_status: "ACTIVE" | "CLOSED" | null;
      agent_id: string | null;
      agent_name: string | null;
      conversation_updated_at: Date | null;
      total: number;
    }>
  >`
    WITH s AS (
      SELECT
        l."id" AS lead_id,
        count(e."id")::int AS enquiry_count,
        (count(e."id") FILTER (WHERE NOT e."answered"))::int AS missed_count,
        min(e."createdAt") AS first_at,
        max(e."createdAt") AS last_at
      FROM "Lead" l
      LEFT JOIN "Enquiry" e ON e."leadId" = l."id" ${enquiryInBranch("e")}
      WHERE l."companyId" = ${actor.companyId}
      GROUP BY l."id"
    ),
    latest AS (
      SELECT DISTINCT ON (e."leadId")
        e."leadId" AS lead_id,
        c."id" AS conversation_id,
        c."status"::text AS status,
        a."id" AS agent_id,
        a."name" AS agent_name,
        c."updatedAt" AS updated_at
      FROM "Enquiry" e
      JOIN "Lead" l ON l."id" = e."leadId" AND l."companyId" = ${actor.companyId} ${enquiryInBranch("e")}
      JOIN "Conversation" c ON c."id" = e."conversationId"
      JOIN "Agent" a ON a."id" = c."agentId"
      ORDER BY e."leadId", e."createdAt" DESC, e."id" DESC
    )
    SELECT
      l."id", l."companyId", l."name", l."phone", l."phoneKey",
      l."maritalStatus", l."city", l."branchId",
      b."name" AS "branchName", l."createdAt", l."updatedAt",
      s.enquiry_count, s.missed_count, s.first_at, s.last_at,
      latest.conversation_id, latest.status AS conversation_status,
      latest.agent_id, latest.agent_name, latest.updated_at AS conversation_updated_at,
      (count(*) OVER ())::int AS total
    FROM "Lead" l
    JOIN s ON s.lead_id = l."id"
    LEFT JOIN "Branch" b ON b."id" = l."branchId"
    LEFT JOIN latest ON latest.lead_id = l."id"
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${LEAD_ORDER[query.sort]} ${direction} NULLS LAST, l."id" ${direction}
    LIMIT ${query.pageSize} OFFSET ${offset}
  `;

  // A page past the end has no rows to carry the window total, so count it.
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && query.page > 1) {
    const [row] = await prisma.$queryRaw<Array<{ total: number }>>`
      WITH s AS (
        SELECT l."id" AS lead_id, count(e."id")::int AS enquiry_count,
          (count(e."id") FILTER (WHERE NOT e."answered"))::int AS missed_count
        FROM "Lead" l LEFT JOIN "Enquiry" e ON e."leadId" = l."id" ${enquiryInBranch("e")}
        WHERE l."companyId" = ${actor.companyId}
        GROUP BY l."id"
      ),
      latest AS (
        SELECT DISTINCT ON (e."leadId") e."leadId" AS lead_id, c."id" AS conversation_id,
          c."status"::text AS status
        FROM "Enquiry" e JOIN "Conversation" c ON c."id" = e."conversationId"
        WHERE TRUE ${enquiryInBranch("e")}
        ORDER BY e."leadId", e."createdAt" DESC, e."id" DESC
      )
      SELECT count(*)::int AS total
      FROM "Lead" l
      JOIN s ON s.lead_id = l."id"
      LEFT JOIN "Branch" b ON b."id" = l."branchId"
      LEFT JOIN latest ON latest.lead_id = l."id"
      WHERE ${Prisma.join(where, " AND ")}
    `;
    total = row?.total ?? 0;
  }

  return {
    rows: rows.map((row) => ({
      ...toLead(
        { ...row, branch: row.branchName ? { name: row.branchName } : null },
        {
          enquiryCount: row.enquiry_count,
          missedCount: row.missed_count,
          firstEnquiryAt: row.first_at?.toISOString() ?? null,
          lastEnquiryAt: row.last_at?.toISOString() ?? null,
        },
      ),
      latestConversation:
        row.conversation_id && row.conversation_status && row.agent_id && row.agent_name
          ? {
              id: row.conversation_id,
              status: row.conversation_status,
              agentId: row.agent_id,
              agentName: row.agent_name,
              updatedAt: (row.conversation_updated_at ?? row.updatedAt).toISOString(),
            }
          : null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** One lead with its full history, newest first. */
export async function getLead(leadId: string, actor: AdminTokenPayload): Promise<LeadDetail> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      branch: { select: { name: true } },
      enquiries: {
        // A branch admin sees only the times this person contacted their branch.
        where: actor.branchId ? { branchId: actor.branchId } : {},
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { branch: { select: { name: true } } },
      },
    },
  });

  if (!lead || lead.companyId !== actor.companyId) throw notFound("Lead not found");
  if (actor.branchId && lead.enquiries.length === 0) throw notFound("Lead not found");

  return {
    ...toLead(lead, statsFromEnquiries(lead.enquiries)),
    enquiries: lead.enquiries.map((enquiry) => toEnquiry(enquiry)),
  };
}

/* ---------------------------------- stats ---------------------------------- */

export async function getStats(actor: AdminTokenPayload): Promise<AdminStats> {
  const branchWhere = branchScope(actor);
  const agentScope = { branch: branchWhere };
  const conversationScope = { agent: agentScope };
  const leadInBranch = actor.branchId ? { branchId: actor.branchId } : {};

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
    prisma.branch.count({ where: branchWhere }),
    prisma.branch.count({ where: { ...branchWhere, isActive: true } }),
    prisma.agent.count({ where: agentScope }),
    prisma.agent.count({ where: { ...agentScope, isActive: true } }),
    prisma.agent.count({ where: { ...agentScope, isActive: true, isOnline: true } }),
    prisma.conversation.count({ where: { ...conversationScope, status: "ACTIVE" } }),
    prisma.conversation.count({ where: { ...conversationScope, status: "CLOSED" } }),
    prisma.lead.count({
      where: {
        companyId: actor.companyId,
        ...(actor.branchId ? { enquiries: { some: leadInBranch } } : {}),
      },
    }),
    prisma.lead.count({
      where: {
        companyId: actor.companyId,
        enquiries: { some: { answered: false, ...leadInBranch } },
      },
    }),
  ]);

  return {
    branches: { total: branches, active: activeBranches },
    agents: { total: agents, active: activeAgents, online: onlineAgents },
    conversations: { active, closed },
    leads: { total: leads, missed: missedLeads },
  };
}
