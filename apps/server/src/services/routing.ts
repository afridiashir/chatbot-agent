import { prisma } from "@repo/db";
import type { AssignmentResult, MaritalStatus } from "@repo/types";
import { normalizePhone, visitorPhoneKey } from "@repo/types";
import { notFound } from "../lib/http.js";
import { toConversationWithAgent } from "../lib/serialize.js";
import { initialLabelId } from "./labels.js";

export const NO_AGENTS_MESSAGE = "No agents are currently available.";

export interface AssignAgentInput {
  branchId: string;
  /**
   * From an agent's personal link: the chat always goes to this agent, online
   * or not. It waits in their inbox until they're back.
   */
  preferredAgentId?: string;
  visitorId: string;
  visitor: { name: string; phone: string; maritalStatus: MaritalStatus; city: string };
  initialMessage?: string;
}

/**
 * Records one approach from one person.
 *
 * The Lead row is deduplicated on their normalised phone number within the
 * company, so the same person reaching us from a second device — or writing
 * their number a different way — updates it rather than creating a twin. The
 * Enquiry row is always new, which is what builds the history: every time they
 * got in touch, which branch they wanted, and whether anyone answered.
 *
 * Runs on every submission — including the ones where nobody was online —
 * because an enquiry that never reached an agent is precisely the one worth
 * following up.
 */
async function recordEnquiry(
  tx: Pick<typeof prisma, "lead" | "enquiry">,
  input: AssignAgentInput & { companyId: string },
  outcome: { answered: boolean; conversationId?: string },
): Promise<void> {
  const phoneKey = normalizePhone(input.visitor.phone);

  const lead = await tx.lead.upsert({
    where: { companyId_phoneKey: { companyId: input.companyId, phoneKey } },
    create: {
      companyId: input.companyId,
      phoneKey,
      name: input.visitor.name,
      phone: input.visitor.phone,
      maritalStatus: input.visitor.maritalStatus,
      city: input.visitor.city,
      branchId: input.branchId,
    },
    update: {
      // Latest details win: people correct their own typos, and their city or
      // marital status may genuinely have changed since they last wrote in.
      name: input.visitor.name,
      phone: input.visitor.phone,
      maritalStatus: input.visitor.maritalStatus,
      city: input.visitor.city,
      branchId: input.branchId,
    },
    select: { id: true },
  });

  await tx.enquiry.create({
    data: {
      leadId: lead.id,
      branchId: input.branchId,
      conversationId: outcome.conversationId ?? null,
      answered: outcome.answered,
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

  // Resolved before the transaction opens: every new chat is given the
  // company's initial label ("Initiated"), and creating it lazily inside the
  // routing transaction would hold the agent locks for longer than needed.
  const initialLabel = await initialLabelId(branch.companyId);

  return prisma.$transaction(async (tx) => {
    // Upserted every time, so a returning visitor can correct details they got
    // wrong the first time. The identity key is rewritten with them: someone who
    // fixes a mistyped number becomes a different person, and the chats they are
    // shown have to follow the number they actually own.
    const phoneKey = visitorPhoneKey(input.visitor.phone, input.visitorId);
    await tx.visitor.upsert({
      where: { id: input.visitorId },
      create: {
        id: input.visitorId,
        name: input.visitor.name,
        phone: input.visitor.phone,
        phoneKey,
        maritalStatus: input.visitor.maritalStatus,
        city: input.visitor.city,
      },
      update: {
        name: input.visitor.name,
        phone: input.visitor.phone,
        phoneKey,
        maritalStatus: input.visitor.maritalStatus,
        city: input.visitor.city,
      },
    });

    // A returning visitor rejoins their open chat instead of opening a second
    // one. Checked before availability so they can still reach an agent who has
    // since gone offline.
    //
    // Anywhere in the company, not only in the branch they have just arrived
    // at: an open chat is a conversation already in progress with a particular
    // person, and coming back to say one more thing should continue it rather
    // than start again with a stranger who cannot see any of it. This is what
    // makes a handed-over chat survive the visitor closing the tab — the new
    // agent may well be in another branch, and that is the whole point of
    // having handed it to them.
    //
    // From an agent's link, only a chat with that agent counts: someone who
    // followed a specific person's link expects to talk to them.
    const existing = await tx.conversation.findFirst({
      where: {
        // By person rather than by browser: the same number on a second device
        // is the same conversation, which is the whole point of the list the
        // widget now opens on.
        visitor: { phoneKey },
        status: "ACTIVE",
        ...(input.preferredAgentId
          ? { agentId: input.preferredAgentId }
          : // Company-wide, never wider: one visitor id is the same browser on
            // every site the widget is on, and another company's chat must not
            // surface here.
            { agent: { branch: { companyId: branch.companyId } } }),
      },
      orderBy: { createdAt: "desc" },
      include: { agent: true, visitor: true },
    });

    if (existing) {
      await recordEnquiry(
        tx,
        { ...input, companyId: branch.companyId },
        { answered: true, conversationId: existing.id },
      );
      return { available: true, conversation: toConversationWithAgent(existing), resumed: true };
    }

    // A personal link skips routing entirely: the visitor chose this agent.
    // Their availability isn't checked, so an offline agent still gets the
    // lead and answers when they're back.
    if (input.preferredAgentId) {
      const conversation = await tx.conversation.create({
        data: {
          agentId: input.preferredAgentId,
          visitorId: input.visitorId,
          labels: { create: [{ labelId: initialLabel }] },
          ...(input.initialMessage
            ? { messages: { create: [{ senderType: "VISITOR", content: input.initialMessage }] } }
            : {}),
        },
        include: { agent: true, visitor: true },
      });
      await recordEnquiry(
        tx,
        { ...input, companyId: branch.companyId },
        { answered: true, conversationId: conversation.id },
      );
      return {
        available: true,
        conversation: toConversationWithAgent(conversation),
        resumed: false,
      };
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
      await recordEnquiry(tx, { ...input, companyId: branch.companyId }, { answered: false });
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
      await recordEnquiry(tx, { ...input, companyId: branch.companyId }, { answered: false });
      return { available: false, message: NO_AGENTS_MESSAGE };
    }

    const conversation = await tx.conversation.create({
      data: {
        agentId: chosen.id,
        visitorId: input.visitorId,
        labels: { create: [{ labelId: initialLabel }] },
        ...(input.initialMessage
          ? { messages: { create: [{ senderType: "VISITOR", content: input.initialMessage }] } }
          : {}),
      },
      include: { agent: true, visitor: true },
    });

    await recordEnquiry(
      tx,
      { ...input, companyId: branch.companyId },
      { answered: true, conversationId: conversation.id },
    );

    return { available: true, conversation: toConversationWithAgent(conversation), resumed: false };
  });
}
