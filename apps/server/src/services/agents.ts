import { DUMMY_PASSWORD_HASH, prisma, verifyPassword } from "@repo/db";
import type { Agent, AgentStatusPayload, LoginResult } from "@repo/types";
import type { LoginBody } from "@repo/validation";
import { signAgentToken, type AgentTokenPayload } from "../lib/auth.js";
import { forbidden, notFound, unauthorized } from "../lib/http.js";
import { toAgent } from "../lib/serialize.js";

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
): Promise<{ agent: Agent; event: AgentStatusPayload }> {
  if (actor.agentId !== agentId) {
    throw forbidden("You can only change your own availability");
  }

  const existing = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!existing) throw notFound("Agent not found");
  if (!existing.isActive) throw forbidden("This account has been deactivated");

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: { isOnline },
  });

  return {
    agent: toAgent(updated),
    event: { agentId: updated.id, branchId: updated.branchId, isOnline: updated.isOnline },
  };
}
