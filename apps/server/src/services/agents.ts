import { DUMMY_PASSWORD_HASH, prisma, verifyPassword } from "@repo/db";
import type { Agent, AgentStatusPayload, LoginResult, PublicAgentProfile } from "@repo/types";
import type { LoginBody } from "@repo/validation";
import { signAgentToken, type AgentTokenPayload } from "../lib/auth.js";
import { forbidden, notFound, unauthorized } from "../lib/http.js";
import { avatarPath, toAgent } from "../lib/serialize.js";

/**
 * The colleagues an agent may hand a visitor on to.
 *
 * Their own branch only, and only the people a visitor could actually reach:
 * deactivated accounts are left out, as is the agent themselves — offering to
 * introduce someone to yourself is not a handover.
 *
 * Deliberately the visitor-facing card rather than the staff record: this is
 * shared into a chat, and a colleague's email address is also their login.
 */
export async function listColleagues(
  agentId: string,
  actor: AgentTokenPayload,
): Promise<PublicAgentProfile[]> {
  if (actor.agentId !== agentId) throw forbidden("You can only list your own colleagues");

  const rows = await prisma.agent.findMany({
    where: {
      branchId: actor.branchId,
      isActive: true,
      id: { not: agentId },
      branch: { isActive: true },
    },
    // Whoever can answer right now comes first; the rest read alphabetically.
    orderBy: [{ isOnline: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      avatarKey: true,
      isOnline: true,
      branch: { select: { id: true, name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarUrl: avatarPath(row),
    isOnline: row.isOnline,
    branch: { id: row.branch.id, name: row.branch.name },
  }));
}

/**
 * The card a visitor sees when opening an agent's chat link. Deactivated
 * agents, and agents of a deactivated branch, read as missing.
 */
export async function getPublicAgentProfile(agentId: string): Promise<PublicAgentProfile> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      avatarKey: true,
      isOnline: true,
      isActive: true,
      branch: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (!agent || !agent.isActive || !agent.branch.isActive) throw notFound("Agent not found");
  return {
    id: agent.id,
    name: agent.name,
    avatarUrl: avatarPath(agent),
    isOnline: agent.isOnline,
    branch: { id: agent.branch.id, name: agent.branch.name },
  };
}

const BAD_CREDENTIALS = "Incorrect email or password";

/**
 * Every account carries its own scrypt hash. A missing agent still pays the
 * cost of a verification against a dummy hash, so the timing of "no such
 * account" matches "wrong password" and neither can be probed from outside.
 */
export async function loginAgent(input: LoginBody): Promise<LoginResult> {
  const agent = await prisma.agent.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });

  const passwordOk = await verifyPassword(
    input.password,
    agent?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!agent || !passwordOk) throw unauthorized(BAD_CREDENTIALS);

  // Checked after the password so a deactivated account cannot be identified
  // without knowing its credentials in the first place.
  if (!agent.isActive) {
    throw unauthorized("This account has been deactivated. Contact your administrator.");
  }

  return {
    token: signAgentToken({ agentId: agent.id, branchId: agent.branchId }),
    agent: toAgent(agent),
  };
}

export async function getAgent(agentId: string): Promise<Agent> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw notFound("Agent not found");
  return toAgent(agent);
}

/**
 * Flips availability. Going offline intentionally leaves existing conversations
 * ACTIVE — the agent still owns them — it only stops new visitors being routed
 * here, because `assignAgent` filters on `isOnline`.
 */
export async function setAgentStatus(
  agentId: string,
  isOnline: boolean,
  actor: AgentTokenPayload,
): Promise<{ agent: Agent; event: AgentStatusPayload; companyId: string }> {
  if (actor.agentId !== agentId) {
    throw forbidden("You can only change your own availability");
  }

  const existing = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { branch: { select: { companyId: true } } },
  });
  if (!existing) throw notFound("Agent not found");
  if (!existing.isActive) throw forbidden("This account has been deactivated");

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: { isOnline },
  });

  return {
    agent: toAgent(updated),
    event: { agentId: updated.id, branchId: updated.branchId, isOnline: updated.isOnline },
    companyId: existing.branch.companyId,
  };
}
