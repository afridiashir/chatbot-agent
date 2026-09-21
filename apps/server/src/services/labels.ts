import { prisma } from "@repo/db";
import type { Label, LabelRef, LabelWithUsage } from "@repo/types";
import { INITIAL_LABEL_NAME } from "@repo/types";
import type { CreateLabelBody, UpdateLabelBody } from "@repo/validation";
import type { Actor } from "../lib/actor.js";
import { requireCompanyAdmin } from "../lib/admin-scope.js";
import type { AdminTokenPayload } from "../lib/auth.js";
import { conflict, forbidden, notFound } from "../lib/http.js";
import { toLabel } from "../lib/serialize.js";

/**
 * Labels are company-wide. Who may *manage* the list and who may *apply* one
 * are deliberately different questions: a company admin curates the vocabulary,
 * while any agent working a chat — and any admin who can see it — can put a
 * label on it. Labelling is the one write an admin has on a conversation they
 * are otherwise only reading.
 */

/** Which labels exist, for a picker. Ordered so "Initiated" leads. */
export async function listLabels(companyId: string): Promise<Label[]> {
  const rows = await prisma.label.findMany({
    where: { companyId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return rows.map(toLabel);
}

/**
 * The same list for an agent, whose token carries a branch rather than a
 * company — labels are company-wide, so the branch is resolved first.
 */
export async function listLabelsForBranch(branchId: string): Promise<Label[]> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { companyId: true },
  });
  if (!branch) throw notFound("Branch not found");
  return listLabels(branch.companyId);
}

/** The same list for the admin's management page, with how many chats use each. */
export async function listLabelsWithUsage(actor: AdminTokenPayload): Promise<LabelWithUsage[]> {
  const rows = await prisma.label.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { _count: { select: { conversations: true } } },
  });
  return rows.map((row) => ({ ...toLabel(row), conversationCount: row._count.conversations }));
}

export async function createLabel(
  input: CreateLabelBody,
  actor: AdminTokenPayload,
): Promise<Label> {
  requireCompanyAdmin(actor);
  const duplicate = await prisma.label.findFirst({
    where: { companyId: actor.companyId, name: input.name },
    select: { id: true },
  });
  if (duplicate) throw conflict("A label with that name already exists");

  const label = await prisma.label.create({
    data: { companyId: actor.companyId, name: input.name, color: input.color },
  });
  return toLabel(label);
}

export async function updateLabel(
  labelId: string,
  input: UpdateLabelBody,
  actor: AdminTokenPayload,
): Promise<Label> {
  requireCompanyAdmin(actor);
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label || label.companyId !== actor.companyId) throw notFound("Label not found");

  if (input.name && input.name !== label.name) {
    const duplicate = await prisma.label.findFirst({
      where: { companyId: actor.companyId, name: input.name, id: { not: labelId } },
      select: { id: true },
    });
    if (duplicate) throw conflict("A label with that name already exists");
  }

  // Renaming and recolouring the system label is allowed: a company that calls
  // this stage "New enquiry" should be able to say so. Only deletion is barred.
  const updated = await prisma.label.update({
    where: { id: labelId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
  return toLabel(updated);
}

export async function deleteLabel(labelId: string, actor: AdminTokenPayload): Promise<void> {
  requireCompanyAdmin(actor);
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label || label.companyId !== actor.companyId) throw notFound("Label not found");
  if (label.isSystem) {
    throw conflict(
      "Every new chat is given this label, so it cannot be deleted. Rename it instead.",
    );
  }
  // The join rows cascade; the conversations themselves are untouched.
  await prisma.label.delete({ where: { id: labelId } });
}

/* ------------------------- labels on a conversation ------------------------ */

/** Labels currently on a conversation, in the order a picker would list them. */
export async function conversationLabels(conversationId: string): Promise<LabelRef[]> {
  const rows = await prisma.conversationLabel.findMany({
    where: { conversationId },
    include: { label: true },
    orderBy: [{ label: { isSystem: "desc" } }, { label: { name: "asc" } }],
  });
  return rows.map((row) => ({
    id: row.label.id,
    name: row.label.name,
    color: row.label.color as LabelRef["color"],
  }));
}

/**
 * The conversation this actor is allowed to label, and the company it belongs
 * to. An agent may label only their own chats; an admin any chat in their
 * scope. Anything else reads as missing, so ids cannot be probed.
 */
async function labellable(conversationId: string, actor: Actor): Promise<{ companyId: string }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      agentId: true,
      agent: { select: { branchId: true, branch: { select: { companyId: true } } } },
    },
  });
  if (!conversation) throw notFound("Conversation not found");

  const companyId = conversation.agent.branch.companyId;

  if (actor.type === "ADMIN") {
    const inScope =
      companyId === actor.companyId &&
      (actor.branchId === null || conversation.agent.branchId === actor.branchId);
    if (!inScope) throw notFound("Conversation not found");
    return { companyId };
  }
  if (actor.type === "AGENT") {
    if (conversation.agentId !== actor.agentId) {
      throw forbidden("This conversation belongs to someone else");
    }
    return { companyId };
  }
  // Visitors never see labels, let alone set them.
  throw forbidden("Not allowed");
}

/** Idempotent: labelling a chat that already carries the label is a no-op. */
export async function addConversationLabel(
  conversationId: string,
  labelId: string,
  actor: Actor,
): Promise<LabelRef[]> {
  const { companyId } = await labellable(conversationId, actor);

  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label || label.companyId !== companyId) throw notFound("Label not found");

  await prisma.conversationLabel.upsert({
    where: { conversationId_labelId: { conversationId, labelId } },
    create: { conversationId, labelId },
    update: {},
  });
  return conversationLabels(conversationId);
}

/** Also idempotent: removing one that is not there succeeds. */
export async function removeConversationLabel(
  conversationId: string,
  labelId: string,
  actor: Actor,
): Promise<LabelRef[]> {
  await labellable(conversationId, actor);
  await prisma.conversationLabel.deleteMany({ where: { conversationId, labelId } });
  return conversationLabels(conversationId);
}

/**
 * The label every conversation starts with, created on demand.
 *
 * Looked up by `isSystem` rather than by name, so a company that renamed it to
 * "New enquiry" still gets their own label on new chats rather than a second
 * one called "Initiated".
 */
export async function initialLabelId(companyId: string): Promise<string> {
  const existing = await prisma.label.findFirst({
    where: { companyId, isSystem: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.label.create({
    data: { companyId, name: INITIAL_LABEL_NAME, color: "grey", isSystem: true },
    select: { id: true },
  });
  return created.id;
}
