import { prisma } from "@repo/db";
import type { AgentWithLoad, Branch, BranchWithAgents } from "@repo/types";
import { notFound } from "../lib/http.js";
import { toAgentWithLoad, toBranch } from "../lib/serialize.js";

/**
 * Ordering agents by `createdAt` then `id` gives every list — and the routing
 * tie-break in step 5 — the same deterministic sequence.
 */
const AGENT_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

/** Public: what the widget offers a visitor. Deactivated branches are omitted. */
export async function listBranches(): Promise<Branch[]> {
  const rows = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toBranch);
}

/**
 * Every branch with its agents and live workload — the admin overview.
 *
 * Includes deactivated rows: an admin needs to see what they switched off in
 * order to switch it back on.
 */
export async function listBranchesWithAgents(): Promise<BranchWithAgents[]> {
  const rows = await prisma.branch.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      agents: {
        orderBy: [{ isActive: "desc" }, ...AGENT_ORDER],
        include: {
          _count: { select: { conversations: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  return rows.map((row) => ({
    ...toBranch(row),
    agents: row.agents.map((agent) => toAgentWithLoad(agent, agent._count.conversations)),
  }));
}

/**
 * Agents of a branch with their live workload. The count is derived from
 * ACTIVE conversations, so closing one immediately lowers the number.
 */
export async function listBranchAgents(branchId: string): Promise<AgentWithLoad[]> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });
  if (!branch) throw notFound("Branch not found");

  const rows = await prisma.agent.findMany({
    where: { branchId },
    orderBy: [...AGENT_ORDER],
    include: {
      _count: { select: { conversations: { where: { status: "ACTIVE" } } } },
    },
  });

  return rows.map((row) => toAgentWithLoad(row, row._count.conversations));
}
