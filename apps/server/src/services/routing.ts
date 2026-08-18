import { prisma } from "@repo/db";
import type { AssignmentResult } from "@repo/types";
import { notFound } from "../lib/http.js";
import { toConversationWithAgent } from "../lib/serialize.js";

export const NO_AGENTS_MESSAGE = "No agents are currently available.";

export interface AssignAgentInput {
  branchId: string;
  visitorId: string;
  visitor: { name: string; email: string; phone: string };
  initialMessage?: string;
}

/**
 * Records the person behind an enquiry, deduplicated on email within the
 * company. Runs on every submission — including the ones where nobody was
 * online — because an enquiry that never reached an agent is precisely the one
 * worth following up.
 *
 * `missed` marks that this particular attempt found nobody available.
 */
async function recordLead(
  tx: Pick<typeof prisma, "lead">,
  input: AssignAgentInput & { companyId: string },
  missed: boolean,
): Promise<void> {
  const email = input.visitor.email.trim().toLowerCase();

  await tx.lead.upsert({
    where: { companyId_email: { companyId: input.companyId, email } },
    create: {
      companyId: input.companyId,
      email,
      name: input.visitor.name,
      phone: input.visitor.phone,
      branchId: input.branchId,
      enquiryCount: 1,
      missedCount: missed ? 1 : 0,
    },
    update: {
      // Latest details win: people correct their own typos.
      name: input.visitor.name,
      phone: input.visitor.phone,
      branchId: input.branchId,
      enquiryCount: { increment: 1 },
      ...(missed ? { missedCount: { increment: 1 } } : {}),
    },
  });
}

interface AgentCandidate {
  id: string;
  _count: { conversations: number };
}

/**
 * Lowest active load wins. Ties break on `createdAt` then `id`, matching
 * AGENT_ORDER in the branch service, so repeated assignments are predictable
 * rather than arbitrary.
 */
function pickLeastBusy<T extends AgentCandidate>(candidates: T[]): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (!best || candidate._count.conversations < best._count.conversations) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Routes a visitor to the least-busy online agent in a branch and opens the
 * conversation.
 *
 * Only active agents in an active branch are considered — a soft-deleted agent
 * is never routed to.
 *
 * Concurrency: the whole decision runs in one transaction that begins by taking
 * `FOR UPDATE` row locks on the branch's routable agents. A second visitor
 * arriving at the same branch blocks on those locks until the first has
 * committed its conversation, so it sees the updated load rather than a stale
 * count. Locking in `id` order means two such transactions can never deadlock.
 *
 * READ COMMITTED (the default) is sufficient here precisely because the locks
 * are explicit — no serialization failures to retry.
 */
export async function assignAgent(input: AssignAgentInput): Promise<AssignmentResult> {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { id: true, isActive: true, companyId: true },
  });
  // A deactivated branch is invisible to visitors, so treat it as missing
  // rather than leaking that it once existed.
  if (!branch || !branch.isActive) throw notFound("Branch not found");

  return prisma.$transaction(async (tx) => {
    // Upserted every time, so a returning visitor can correct details they got
    // wrong the first time without opening a second identity.
    await tx.visitor.upsert({
      where: { id: input.visitorId },
      create: {
        id: input.visitorId,
        name: input.visitor.name,
        email: input.visitor.email,
        phone: input.visitor.phone,
      },
      update: {
        name: input.visitor.name,
        email: input.visitor.email,
        phone: input.visitor.phone,
      },
    });

    // A returning visitor rejoins their open chat instead of opening a second
    // one. Checked before availability so they can still reach an agent who has
    // since gone offline.
    const existing = await tx.conversation.findFirst({
      where: {
        visitorId: input.visitorId,
        status: "ACTIVE",
        agent: { branchId: input.branchId },
      },
      orderBy: { createdAt: "desc" },
      include: { agent: true, visitor: true },
    });

    if (existing) {
      await recordLead(tx, { ...input, companyId: branch.companyId }, false);
      return { available: true, conversation: toConversationWithAgent(existing), resumed: true };
    }

    // Lock the candidate set. Anything not locked here cannot be assigned by
    // this transaction, and cannot have its `isOnline` flipped underneath us.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT a."id"
      FROM "Agent" a
      WHERE a."branchId" = ${input.branchId}
        AND a."isOnline" = true
        AND a."isActive" = true
      ORDER BY a."id"
      FOR UPDATE
    `;

    if (locked.length === 0) {
      // The whole point: capture the enquiry even though no chat can start.
      await recordLead(tx, { ...input, companyId: branch.companyId }, true);
      return { available: false, message: NO_AGENTS_MESSAGE };
    }

    const candidates = await tx.agent.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        _count: { select: { conversations: { where: { status: "ACTIVE" } } } },
      },
    });

    const chosen = pickLeastBusy(candidates);
    if (!chosen) {
      await recordLead(tx, { ...input, companyId: branch.companyId }, true);
      return { available: false, message: NO_AGENTS_MESSAGE };
    }

    await recordLead(tx, { ...input, companyId: branch.companyId }, false);

    const conversation = await tx.conversation.create({
      data: {
        agentId: chosen.id,
        visitorId: input.visitorId,
        ...(input.initialMessage
          ? { messages: { create: [{ senderType: "VISITOR", content: input.initialMessage }] } }
          : {}),
      },
      include: { agent: true, visitor: true },
    });

    return { available: true, conversation: toConversationWithAgent(conversation), resumed: false };
  });
}
