/**
 * Admin management surface: branch and agent CRUD, soft delete, and read-only
 * visibility into every agent's conversations.
 *
 * Start the API first (`pnpm --filter @repo/server dev`), then run:
 *   pnpm --filter @repo/server check:admin
 *
 * It creates a throwaway branch and agents and deactivates them again. Run
 * `pnpm db:seed` afterwards to restore the documented demo state.
 */
import type {
  Admin,
  AdminConversationDetail,
  AdminConversationSummary,
  AdminStats,
  Agent,
  Branch,
  BranchWithAgents,
  DeactivateAgentResult,
  Lead,
  LeadDetail,
} from "@repo/types";

const API = process.env.API_URL ?? "http://localhost:4000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD ?? "";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    console.log(`          expected ${JSON.stringify(expected)}`);
    console.log(`          actual   ${JSON.stringify(actual)}`);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; data?: T; message?: string }> {
  const { token, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const body = (await res.json()) as
    | { ok: true; data: T }
    | { ok: false; error: { message: string } };

  return body.ok
    ? { status: res.status, data: body.data }
    : { status: res.status, message: body.error.message };
}

const suffix = Date.now().toString(36);

async function main(): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !AGENT_PASSWORD) {
    throw new Error("SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_AGENT_PASSWORD must be set");
  }

  console.log("\n1. Admin authentication is separate from agent authentication");
  const badLogin = await request("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "wrong-password-entirely" }),
  });
  check("wrong password is rejected", badLogin.status, 401);

  const asAgent = await request("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "bilal.khan@acme.example", password: AGENT_PASSWORD }),
  });
  check("an agent cannot sign in at the admin endpoint", asAgent.status, 401);

  const login = await request<{ token: string; admin: Admin }>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const token = login.data?.token;
  if (!token) throw new Error(`Admin login failed: ${login.message}`);
  check("admin signs in", login.data?.admin.email, ADMIN_EMAIL);

  const agentLogin = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "bilal.khan@acme.example", password: AGENT_PASSWORD }),
  });
  const agentToken = agentLogin.data?.token;
  if (!agentToken) throw new Error("Agent login failed");

  console.log("\n2. Agent tokens do not unlock admin routes");
  check("agent token is refused", (await request("/api/admin/stats", { token: agentToken })).status, 401);
  check("admin token is refused by agent routes", (
    await request("/api/agents/agent_bilal_khan/conversations", { token })
  ).status, 401);
  check("no token at all", (await request("/api/admin/stats")).status, 401);

  // Soft deletes leave rows behind, so the counts asserted at the end are
  // deltas from this baseline. That keeps the suite repeatable.
  const baseline = (await request<AdminStats>("/api/admin/stats", { token })).data;
  if (!baseline) throw new Error("Could not read baseline stats");

  console.log("\n3. Creating a branch");
  const branchName = `Multan ${suffix}`;
  const created = await request<Branch>("/api/admin/branches", {
    method: "POST",
    token,
    body: JSON.stringify({ name: branchName }),
  });
  const branch = created.data;
  if (!branch) throw new Error(`Branch not created: ${created.message}`);
  check("answers 201", created.status, 201);
  check("starts active", branch.isActive, true);

  const duplicate = await request("/api/admin/branches", {
    method: "POST",
    token,
    body: JSON.stringify({ name: branchName }),
  });
  check("duplicate name is refused", duplicate.status, 409);

  const visibleToVisitors = await request<Branch[]>("/api/branches");
  check(
    "new branch is offered to visitors",
    visibleToVisitors.data?.some((b) => b.id === branch.id),
    true,
  );

  console.log("\n4. Creating agents in it");
  const agentEmail = `zoya.hassan.${suffix}@acme.example`;
  const agentCreated = await request<Agent>("/api/admin/agents", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId: branch.id,
      name: "Zoya Hassan",
      email: agentEmail,
      password: "a-strong-agent-password",
    }),
  });
  const agent = agentCreated.data;
  if (!agent) throw new Error(`Agent not created: ${agentCreated.message}`);
  check("answers 201", agentCreated.status, 201);
  check("starts offline", agent.isOnline, false);
  check("starts active", agent.isActive, true);

  const dupeEmail = await request("/api/admin/agents", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId: branch.id,
      name: "Someone Else",
      email: agentEmail,
      password: "another-strong-password",
    }),
  });
  check("duplicate email is refused", dupeEmail.status, 409);

  const weakPassword = await request("/api/admin/agents", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId: branch.id,
      name: "Weak Password",
      email: `weak.${suffix}@acme.example`,
      password: "short",
    }),
  });
  check("a weak password is rejected", weakPassword.status, 400);

  console.log("\n5. The new agent can sign in and work");
  const newAgentLogin = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: agentEmail, password: "a-strong-agent-password" }),
  });
  const newAgentToken = newAgentLogin.data?.token;
  check("signs in with the password the admin set", newAgentLogin.status, 200);
  if (!newAgentToken) throw new Error("New agent could not sign in");

  await request(`/api/agents/${agent.id}/status`, {
    method: "PATCH",
    token: newAgentToken,
    body: JSON.stringify({ isOnline: true }),
  });

  const visitorId = `admin-check-${suffix}`;
  const chat = await request<{ available: boolean; conversation: { id: string; agentId: string } }>(
    "/api/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        branchId: branch.id,
        visitorId,
        visitor: { name: "Admin Check Visitor", email: `${visitorId}@example.com`, phone: "+92 300 0000000" },
      }),
    },
  );
  check("visitors are routed to the new agent", chat.data?.conversation.agentId, agent.id);
  const conversationId = chat.data?.conversation.id;
  if (!conversationId) throw new Error("No conversation created");

  await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ senderType: "VISITOR", visitorId, content: "Testing the new branch" }),
  });

  console.log("\n6. Admin can read any agent's conversations");
  const all = await request<AdminConversationSummary[]>("/api/admin/conversations", { token });
  check(
    "the new conversation appears in the company-wide list",
    all.data?.some((c) => c.id === conversationId),
    true,
  );
  check(
    "rows carry agent and branch labels",
    all.data?.find((c) => c.id === conversationId)?.branch.name,
    branchName,
  );

  const filtered = await request<AdminConversationSummary[]>(
    `/api/admin/conversations?branchId=${branch.id}`,
    { token },
  );
  check("filtering by branch works", filtered.data?.length, 1);

  const otherBranch = await request<AdminConversationSummary[]>(
    "/api/admin/conversations?branchId=branch_karachi&status=ACTIVE",
    { token },
  );
  check(
    "another agent's chats are readable too",
    (otherBranch.data?.length ?? 0) > 0,
    true,
  );

  const transcript = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  check("full transcript is readable", transcript.data?.messages.length, 1);
  check("transcript names the branch", transcript.data?.branch.name, branchName);

  console.log("\n7. Admin visibility is read-only");
  const tryToSend = await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    token,
    body: JSON.stringify({ senderType: "AGENT", content: "admin butting in" }),
  });
  check("admins cannot post into a conversation", tryToSend.status, 403);

  console.log("\n8. Deactivating an agent (soft delete)");
  const deactivated = await request<DeactivateAgentResult>(`/api/admin/agents/${agent.id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ isActive: false }),
  });
  check("agent is marked inactive", deactivated.data?.agent.isActive, false);
  check("agent is forced offline", deactivated.data?.agent.isOnline, false);
  check("their open chats were closed", deactivated.data?.closedConversations, 1);

  const blocked = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: agentEmail, password: "a-strong-agent-password" }),
  });
  check("a deactivated agent cannot sign in", blocked.status, 401);

  const noRoute = await request<{ available: boolean; message?: string }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: branch.id,
      visitorId: `admin-check-2-${suffix}`,
      visitor: { name: "Second Visitor", email: `second.${suffix}@example.com`, phone: "+92 300 0000001" },
    }),
  });
  check("nobody is routed to a deactivated agent", noRoute.data?.available, false);

  console.log("\n9. History survives the soft delete");
  const stillThere = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  check("the transcript is still readable", stillThere.data?.messages.length, 1);
  check("and is now closed", stillThere.data?.status, "CLOSED");

  console.log("\n10. Deactivating a branch");
  const branchOff = await request<Branch>(`/api/admin/branches/${branch.id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ isActive: false }),
  });
  check("branch is marked inactive", branchOff.data?.isActive, false);

  const afterHide = await request<Branch[]>("/api/branches");
  check(
    "it disappears from the visitor picker",
    afterHide.data?.some((b) => b.id === branch.id),
    false,
  );

  const hiddenRoute = await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: branch.id,
      visitorId: `admin-check-3-${suffix}`,
      visitor: { name: "Third Visitor", email: `third.${suffix}@example.com`, phone: "+92 300 0000002" },
    }),
  });
  check("and cannot be routed to", hiddenRoute.status, 404);

  const adminStillSees = await request<BranchWithAgents[]>("/api/admin/branches", { token });
  check(
    "but the admin still sees it, so it can be switched back on",
    adminStillSees.data?.some((b) => b.id === branch.id && !b.isActive),
    true,
  );

  console.log("\n11. Renaming");
  const renamed = await request<Branch>(`/api/admin/branches/${branch.id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name: `${branchName} (closed)` }),
  });
  check("branch renames", renamed.data?.name, `${branchName} (closed)`);

  const clash = await request(`/api/admin/branches/${branch.id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name: "Karachi" }),
  });
  check("renaming onto an existing name is refused", clash.status, 409);

  console.log("\n11b. Leads are captured even when nobody answers");
  // Peshawar is seeded entirely offline, so this enquiry reaches no agent.
  const leadEmail = `walkin.${suffix}@example.com`;
  const missedChat = await request<{ available: boolean }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: "branch_peshawar",
      visitorId: `lead-a-${suffix}`,
      visitor: { name: "Walkin Person", email: leadEmail, phone: "+92 300 7778888" },
    }),
  });
  check("no agent was available", missedChat.data?.available, false);

  const afterMiss = await request<Lead[]>(`/api/admin/leads?search=${leadEmail}`, { token });
  check("the lead was still saved", afterMiss.data?.length, 1);
  check("flagged as a missed enquiry", afterMiss.data?.[0]?.missedCount, 1);
  check("counted as one enquiry", afterMiss.data?.[0]?.enquiryCount, 1);

  console.log("\n11c. The same person enquiring again is not duplicated");
  // A different browser: new visitor id, same person.
  await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: "branch_peshawar",
      visitorId: `lead-b-${suffix}`,
      visitor: { name: "Walkin Person Jr", email: leadEmail, phone: "+92 300 7778899" },
    }),
  });

  const afterSecond = await request<Lead[]>(`/api/admin/leads?search=${leadEmail}`, { token });
  check("still one row, not two", afterSecond.data?.length, 1);
  check("enquiries accumulated", afterSecond.data?.[0]?.enquiryCount, 2);
  check("misses accumulated", afterSecond.data?.[0]?.missedCount, 2);
  check("latest details win", afterSecond.data?.[0]?.name, "Walkin Person Jr");

  console.log("\n11d. Leads from answered chats are recorded too");
  const servedEmail = `served.${suffix}@example.com`;
  await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: "branch_karachi",
      visitorId: `lead-c-${suffix}`,
      visitor: { name: "Served Person", email: servedEmail, phone: "+92 300 1231234" },
    }),
  });
  const served = await request<Lead[]>(`/api/admin/leads?search=${servedEmail}`, { token });
  check("recorded", served.data?.length, 1);
  check("with no missed enquiries", served.data?.[0]?.missedCount, 0);

  const missedOnly = await request<Lead[]>("/api/admin/leads?missedOnly=true", { token });
  check(
    "the missed-only filter excludes them",
    missedOnly.data?.some((l) => l.email === servedEmail),
    false,
  );
  check(
    "and includes the unanswered one",
    missedOnly.data?.some((l) => l.email === leadEmail),
    true,
  );

  check(
    "agents cannot read the lead list",
    (await request("/api/admin/leads", { token: agentToken })).status,
    401,
  );

  console.log("\n11e. Each approach is kept as its own dated enquiry");
  const leadId = afterSecond.data?.[0]?.id;
  if (!leadId) throw new Error("Expected a lead id");

  const detail = await request<LeadDetail>(`/api/admin/leads/${leadId}`, { token });
  check("both approaches are recorded separately", detail.data?.enquiries.length, 2);
  check(
    "each one says whether anyone answered",
    detail.data?.enquiries.every((e) => e.answered === false),
    true,
  );
  check(
    "each one carries its own timestamp",
    new Set(detail.data?.enquiries.map((e) => e.createdAt)).size,
    2,
  );
  check("newest first", (() => {
    const times = (detail.data?.enquiries ?? []).map((e) => Date.parse(e.createdAt));
    return times.every((t, i) => i === 0 || times[i - 1]! >= t);
  })(), true);
  check("the branch is remembered per enquiry", detail.data?.enquiries[0]?.branchName, "Peshawar");

  console.log("\n11f. An answered enquiry links back to its conversation");
  const servedLead = await request<Lead[]>(`/api/admin/leads?search=${servedEmail}`, { token });
  const servedId = servedLead.data?.[0]?.id;
  if (!servedId) throw new Error("Expected the served lead");
  const servedDetail = await request<LeadDetail>(`/api/admin/leads/${servedId}`, { token });
  check("marked as answered", servedDetail.data?.enquiries[0]?.answered, true);
  check(
    "and points at the chat that opened",
    typeof servedDetail.data?.enquiries[0]?.conversationId === "string",
    true,
  );

  console.log("\n11g. Counts are derived, so they cannot drift");
  check("enquiry count matches the history length", detail.data?.enquiryCount, 2);
  check("missed count matches the unanswered ones", detail.data?.missedCount, 2);
  check("first and last are exposed", typeof detail.data?.firstEnquiryAt === "string", true);

  check(
    "agents cannot read a lead history",
    (await request(`/api/admin/leads/${leadId}`, { token: agentToken })).status,
    401,
  );

  console.log("\n12. Stats");
  const stats = (await request<AdminStats>("/api/admin/stats", { token })).data;
  if (!stats) throw new Error("Could not read stats");

  check(
    "branch total grew by the one we added",
    stats.branches.total - baseline.branches.total,
    1,
  );
  check(
    "active branches are unchanged, since we deactivated it",
    stats.branches.active - baseline.branches.active,
    0,
  );
  check("agent total grew by the one we added", stats.agents.total - baseline.agents.total, 1);
  check(
    "active agents are unchanged, since we deactivated them",
    stats.agents.active - baseline.agents.active,
    0,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("Run `pnpm db:seed` to restore the demo data.\n");
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
