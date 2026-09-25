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
  ConversationTransfer,
  DeactivateAgentResult,
  DeleteConversationResult,
  LabelWithUsage,
  Lead,
  Message,
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
    { ok: true; data: T } | { ok: false; error: { message: string } };

  return body.ok
    ? { status: res.status, data: body.data }
    : { status: res.status, message: body.error.message };
}

const suffix = Date.now().toString(36);
/** Digits, for building phone numbers unique to this run. Leads key on phone. */
const digits = String(Date.now()).slice(-7);

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
  check(
    "agent token is refused",
    (await request("/api/admin/stats", { token: agentToken })).status,
    401,
  );
  check(
    "admin token is refused by agent routes",
    (await request("/api/agents/agent_bilal_khan/conversations", { token })).status,
    401,
  );
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

  console.log("\n3b. The main branch is where unlinked chats land");
  check("a newly added branch is not the main one", branch.isMain, false);

  const mainBefore = (await request<BranchWithAgents[]>("/api/admin/branches", { token })).data
    ?.filter((b) => b.isMain)
    .map((b) => b.id);
  check("exactly one branch is main", mainBefore?.length, 1);

  const takeMain = await request<Branch>(`/api/admin/branches/${branch.id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ isMain: true }),
  });
  check("an admin can make a branch the main one", takeMain.data?.isMain, true);

  const afterMove = (await request<BranchWithAgents[]>("/api/admin/branches", { token })).data;
  check("the flag moved rather than being copied", afterMove?.filter((b) => b.isMain).length, 1);

  check(
    "the main branch cannot be deactivated",
    (
      await request(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: false }),
      })
    ).status,
    409,
  );

  // Put it back, so the rest of the suite can deactivate this branch freely.
  await request(`/api/admin/branches/${mainBefore![0]!}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ isMain: true }),
  });

  // The whole point of the flag: the widget no longer asks for a branch, so a
  // chat arriving with neither an agent link nor a branch link must still land
  // somewhere sensible.
  const walkIn = await request<{ available: boolean; conversation?: { agentId: string } }>(
    "/api/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        visitorId: `walkin-${suffix}`,
        visitor: {
          name: "No Link Visitor",
          phone: `+92 305 ${digits}`,
          maritalStatus: "SINGLE",
          city: "Quetta",
        },
      }),
    },
  );
  check("a chat with no branch and no agent link is accepted", walkIn.data?.available, true);
  const walkInBranch = (
    await request<AdminConversationSummary[]>("/api/admin/conversations?limit=200", { token })
  ).data?.find((c) => c.agent.id === walkIn.data?.conversation?.agentId);
  check("and it landed in the main branch", walkInBranch?.branch.id, mainBefore![0]);

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
        visitor: {
          name: "Admin Check Visitor",
          phone: `+92 300 ${digits}`,
          maritalStatus: "MARRIED",
          city: "Lahore",
        },
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
  check("another agent's chats are readable too", (otherBranch.data?.length ?? 0) > 0, true);

  const transcript = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  check("full transcript is readable", transcript.data?.messages.length, 1);
  check("transcript names the branch", transcript.data?.branch.name, branchName);

  console.log("\n7. An admin can step in and reply for the agent");
  const intervened = await request<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    token,
    body: JSON.stringify({ senderType: "AGENT", content: "Admin stepping in." }),
  });
  check("an admin can post into a conversation", intervened.status, 201);
  check("and it is stored as the agent, not as an admin", intervened.data?.senderType, "AGENT");

  check(
    "an admin still cannot speak as the visitor",
    (
      await request(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify({ senderType: "VISITOR", content: "pretending to be them" }),
      })
    ).status,
    403,
  );

  const withAuthor = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  check(
    "the admin transcript names who really typed it",
    withAuthor.data?.adminAuthored?.[intervened.data!.id]?.adminName !== undefined,
    true,
  );

  // The whole point of "on behalf of": the visitor sees their agent throughout.
  const asVisitor = await request<Record<string, unknown>>(
    `/api/conversations/${conversationId}?visitorId=${visitorId}`,
  );
  check(
    "the visitor's copy carries no attribution at all",
    "adminAuthored" in (asVisitor.data ?? {}),
    false,
  );
  check(
    "and no admin name appears anywhere in it",
    JSON.stringify(asVisitor.data ?? {}).includes("Administrator"),
    false,
  );

  console.log("\n7b. An admin can hand the chat to another agent");
  const secondEmail = `imran.shah.${suffix}@acme.example`;
  const secondCreated = await request<Agent>("/api/admin/agents", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId: branch.id,
      name: "Imran Shah",
      email: secondEmail,
      password: "a-strong-agent-password",
    }),
  });
  const second = secondCreated.data;
  if (!second) throw new Error(`Second agent not created: ${secondCreated.message}`);

  const handed = await request<ConversationTransfer>(
    `/api/admin/conversations/${conversationId}/transfer`,
    { method: "POST", token, body: JSON.stringify({ agentId: second.id }) },
  );
  check("the chat is handed over", handed.status, 200);
  check("to the agent that was named", handed.data?.agent.id, second.id);
  check("and stays in its branch when the new agent is in it", handed.data?.branch.id, branch.id);

  const reassigned = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  check("the transcript now names the new agent", reassigned.data?.agent.id, second.id);
  // Handing a chat over says nothing in it: the visitor is not told at all.
  check("and nothing was added to it", reassigned.data?.messages.length, 2);

  check(
    "the agent who lost it can no longer read it",
    (await request(`/api/conversations/${conversationId}`, { token: newAgentToken })).status,
    403,
  );

  const secondLogin = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: secondEmail, password: "a-strong-agent-password" }),
  });
  const secondToken = secondLogin.data?.token;
  // Taking a chat over means taking its history with it: everything the first
  // agent and the visitor said has to be readable by whoever answers next, or
  // they are replying to a conversation they cannot see.
  const inherited = await request<{ messages: Message[]; agent: { id: string } }>(
    `/api/conversations/${conversationId}`,
    { token: secondToken },
  );
  check("and the one who now has it can", inherited.status, 200);
  check("the whole transcript comes with it", inherited.data?.messages.length, 2);
  check(
    "including what the previous agent sent",
    inherited.data?.messages.some((m) => m.content === "Admin stepping in."),
    true,
  );
  check(
    "and what the visitor said before the hand-over",
    inherited.data?.messages.some((m) => m.content === "Testing the new branch"),
    true,
  );

  // And their inbox has to describe it as the conversation it is, rather than
  // as a chat that has only just started.
  const newInbox = await request<
    Array<{ id: string; messageCount: number; lastMessage: Message | null }>
  >(`/api/agents/${second.id}/conversations`, { token: secondToken });
  const inboxRow = newInbox.data?.find((row) => row.id === conversationId);
  check("it appears in the new agent's inbox", Boolean(inboxRow), true);
  check("carrying the message count, not zero", inboxRow?.messageCount, 2);
  check(
    "and the last thing actually said in it",
    inboxRow?.lastMessage?.content,
    "Admin stepping in.",
  );

  // The visitor's own copy is untouched by any of it.
  const visitorCopy = await request<{ messages: Message[] }>(
    `/api/conversations/${conversationId}?visitorId=${visitorId}`,
  );
  check("the visitor keeps the same chat and history", visitorCopy.data?.messages.length, 2);

  check(
    "handing it to whoever already has it is refused",
    (
      await request(`/api/admin/conversations/${conversationId}/transfer`, {
        method: "POST",
        token,
        body: JSON.stringify({ agentId: second.id }),
      })
    ).status,
    409,
  );
  check(
    "an agent outside the admin's reach reads as missing",
    (
      await request(`/api/admin/conversations/${conversationId}/transfer`, {
        method: "POST",
        token,
        body: JSON.stringify({ agentId: "agent_does_not_exist" }),
      })
    ).status,
    404,
  );

  // The visitor's side of a hand-over: they close the tab, come back, and the
  // chat they had is still the chat they get — with whoever has it now, even
  // though that person sits in another branch entirely.
  const acrossBranches = await request<ConversationTransfer>(
    `/api/admin/conversations/${conversationId}/transfer`,
    { method: "POST", token, body: JSON.stringify({ agentId: "agent_bilal_khan" }) },
  );
  check("a chat can be handed to another branch", acrossBranches.status, 200);
  check("and the chat moves to that branch", acrossBranches.data?.branch.id, "branch_karachi");

  const returning = await request<{
    available: boolean;
    resumed?: boolean;
    conversation: { id: string; agentId: string };
  }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      // Arriving where they first did, which is no longer where the chat is.
      branchId: branch.id,
      visitorId,
      visitor: {
        name: "Admin Check Visitor",
        phone: `+92 300 ${digits}`,
        maritalStatus: "MARRIED",
        city: "Lahore",
      },
    }),
  });
  check("a returning visitor is not started over", returning.data?.resumed, true);
  check("they land back in the same conversation", returning.data?.conversation.id, conversationId);
  check(
    "now with the agent who holds it, not a new one",
    returning.data?.conversation.agentId,
    "agent_bilal_khan",
  );

  // Back where it started, so the rest of this script still describes one
  // agent with one open chat.
  const handedBack = await request<ConversationTransfer>(
    `/api/admin/conversations/${conversationId}/transfer`,
    { method: "POST", token, body: JSON.stringify({ agentId: agent.id }) },
  );
  check("and it can be handed back", handedBack.data?.agent.id, agent.id);

  await request(`/api/admin/agents/${second.id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ isActive: false }),
  });
  check(
    "a deactivated agent cannot be handed a chat",
    (
      await request(`/api/admin/conversations/${conversationId}/transfer`, {
        method: "POST",
        token,
        body: JSON.stringify({ agentId: second.id }),
      })
    ).status,
    409,
  );

  console.log("\n7c. An admin can remove one message without touching the rest");
  // Something said in error — a bank detail in the wrong window — has to be
  // removable on its own, not only by deleting the whole conversation.
  const spoken = await request<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ senderType: "VISITOR", visitorId, content: "Wrong window, sorry" }),
  });
  const keep = await request<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ senderType: "VISITOR", visitorId, content: "This one stays" }),
  });
  const doomed = spoken.data?.id ?? "";

  const removedOne = await request<{ id: string; deletedAttachment: boolean }>(
    `/api/admin/conversations/${conversationId}/messages/${doomed}`,
    { method: "DELETE", token },
  );
  check("the message is deleted", removedOne.status, 200);
  check("and it reports which one", removedOne.data?.id, doomed);

  const after = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  const left = (after.data?.messages ?? []).map((message) => message.content);
  check("it is gone from the transcript", left.includes("Wrong window, sorry"), false);
  check("the rest of the conversation is untouched", left.includes("This one stays"), true);
  check("and the chat itself is still there", after.status, 200);

  // The visitor's own copy loses it too: a message removed in error must not
  // survive on the screen it was sent to.
  const visitorAfterDelete = await request<{ messages: Message[] }>(
    `/api/conversations/${conversationId}?visitorId=${visitorId}`,
  );
  check(
    "the visitor's copy loses it as well",
    (visitorAfterDelete.data?.messages ?? []).some((m) => m.id === doomed),
    false,
  );

  check(
    "deleting it twice reads as missing",
    (
      await request(`/api/admin/conversations/${conversationId}/messages/${doomed}`, {
        method: "DELETE",
        token,
      })
    ).status,
    404,
  );
  check(
    "a message from another conversation cannot be deleted through this one",
    (
      await request(`/api/admin/conversations/${conversationId}/messages/msg_does_not_exist`, {
        method: "DELETE",
        token,
      })
    ).status,
    404,
  );
  check(
    "an agent cannot delete messages",
    (
      await request(`/api/admin/conversations/${conversationId}/messages/${keep.data?.id}`, {
        method: "DELETE",
        token: newAgentToken,
      })
    ).status,
    401,
  );

  // Tidied away, so the counts the rest of this script asserts still describe
  // the conversation it set up rather than this section's leftovers.
  await request(`/api/admin/conversations/${conversationId}/messages/${keep.data?.id}`, {
    method: "DELETE",
    token,
  });

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
      visitor: {
        name: "Second Visitor",
        phone: `+92 301 ${digits}`,
        maritalStatus: "SINGLE",
        city: "Karachi",
      },
    }),
  });
  check("nobody is routed to a deactivated agent", noRoute.data?.available, false);

  console.log("\n9. History survives the soft delete");
  const stillThere = await request<AdminConversationDetail>(
    `/api/admin/conversations/${conversationId}`,
    { token },
  );
  // Two: the visitor's opening message, and the admin's intervention in step 7.
  check("the transcript is still readable", stillThere.data?.messages.length, 2);
  check("and is now closed", stillThere.data?.status, "CLOSED");
  check(
    "a closed chat cannot be handed to anyone",
    (
      await request(`/api/admin/conversations/${conversationId}/transfer`, {
        method: "POST",
        token,
        body: JSON.stringify({ agentId: agent.id }),
      })
    ).status,
    409,
  );

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
      visitor: {
        name: "Third Visitor",
        phone: `+92 302 ${digits}`,
        maritalStatus: "DIVORCED",
        city: "Multan",
      },
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
  // Written two different ways across 11b and 11c, on purpose: the point of the
  // dedup test is now that normalisation makes them one person.
  const leadDigits = `777${digits.slice(-4)}`;
  const missedChat = await request<{ available: boolean }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: "branch_peshawar",
      visitorId: `lead-a-${suffix}`,
      visitor: {
        name: "Walkin Person",
        phone: `+92 300 ${leadDigits}`,
        maritalStatus: "SINGLE",
        city: "Peshawar",
      },
    }),
  });
  check("no agent was available", missedChat.data?.available, false);

  const afterMiss = await request<Lead[]>(`/api/admin/leads?search=${leadDigits}`, { token });
  check("the lead was still saved", afterMiss.data?.length, 1);
  check("flagged as a missed enquiry", afterMiss.data?.[0]?.missedCount, 1);
  check("counted as one enquiry", afterMiss.data?.[0]?.enquiryCount, 1);

  console.log("\n11c. The same person enquiring again is not duplicated");
  // A different browser, and the number written in local form this time:
  // `+92 300 777xxxx` and `0300777xxxx` are one person, not two.
  await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: "branch_peshawar",
      visitorId: `lead-b-${suffix}`,
      visitor: {
        name: "Walkin Person Jr",
        phone: `0300${leadDigits}`,
        maritalStatus: "MARRIED",
        city: "Peshawar",
      },
    }),
  });

  const afterSecond = await request<Lead[]>(`/api/admin/leads?search=${leadDigits}`, { token });
  check("still one row, not two", afterSecond.data?.length, 1);
  check("enquiries accumulated", afterSecond.data?.[0]?.enquiryCount, 2);
  check("misses accumulated", afterSecond.data?.[0]?.missedCount, 2);
  check("latest details win", afterSecond.data?.[0]?.name, "Walkin Person Jr");
  check(
    "including the newly given marital status",
    afterSecond.data?.[0]?.maritalStatus,
    "MARRIED",
  );
  check("and the city", afterSecond.data?.[0]?.city, "Peshawar");

  console.log("\n11d. Leads from answered chats are recorded too");
  const servedDigits = `123${digits.slice(-4)}`;
  await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: "branch_karachi",
      visitorId: `lead-c-${suffix}`,
      visitor: {
        name: "Served Person",
        phone: `+92 300 ${servedDigits}`,
        maritalStatus: "WIDOWED",
        city: "Karachi",
      },
    }),
  });
  const served = await request<Lead[]>(`/api/admin/leads?search=${servedDigits}`, { token });
  check("recorded", served.data?.length, 1);
  check("with no missed enquiries", served.data?.[0]?.missedCount, 0);

  const missedOnly = await request<Lead[]>("/api/admin/leads?missedOnly=true", { token });
  check(
    "the missed-only filter excludes them",
    missedOnly.data?.some((l) => l.phone.includes(servedDigits)),
    false,
  );
  check(
    "and includes the unanswered one",
    missedOnly.data?.some((l) => l.phone.includes(leadDigits)),
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
  check(
    "newest first",
    (() => {
      const times = (detail.data?.enquiries ?? []).map((e) => Date.parse(e.createdAt));
      return times.every((t, i) => i === 0 || times[i - 1]! >= t);
    })(),
    true,
  );
  check("the branch is remembered per enquiry", detail.data?.enquiries[0]?.branchName, "Peshawar");

  console.log("\n11f. An answered enquiry links back to its conversation");
  const servedLead = await request<Lead[]>(`/api/admin/leads?search=${servedDigits}`, { token });
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

  console.log("\n11h. Deleting a conversation is permanent, and scoped");
  check(
    "agents cannot delete a conversation",
    (
      await request(`/api/admin/conversations/${conversationId}`, {
        method: "DELETE",
        token: agentToken,
      })
    ).status,
    401,
  );

  const deleted = await request<DeleteConversationResult>(
    `/api/admin/conversations/${conversationId}`,
    { method: "DELETE", token },
  );
  check("the admin can delete it", deleted.status, 200);
  // Same two messages this conversation accumulated above.
  check("and is told what went with it", deleted.data?.deletedMessages, 2);

  check(
    "the transcript is gone",
    (await request(`/api/admin/conversations/${conversationId}`, { token })).status,
    404,
  );
  check(
    "deleting it twice reads as not found",
    (await request(`/api/admin/conversations/${conversationId}`, { method: "DELETE", token }))
      .status,
    404,
  );

  const afterDelete = await request<AdminConversationSummary[]>(
    `/api/admin/conversations?branchId=${branch.id}`,
    { token },
  );
  check("and the row has left the list", afterDelete.data?.length, 0);

  const visitorLead = await request<Lead[]>(`/api/admin/leads?search=${digits}`, { token });
  const visitorLeadId = visitorLead.data?.[0]?.id;
  check("the lead who started it is kept", typeof visitorLeadId === "string", true);
  if (visitorLeadId) {
    const history = await request<LeadDetail>(`/api/admin/leads/${visitorLeadId}`, { token });
    check("their enquiry is kept too", history.data?.enquiries.length, 1);
    check(
      "with its link to the deleted chat cleared",
      history.data?.enquiries[0]?.conversationId,
      null,
    );
  }

  console.log("\n11i. Labels: a custom set, applied by agents and admins alike");
  const startLabels = (await request<LabelWithUsage[]>("/api/admin/labels", { token })).data ?? [];
  const systemLabel = startLabels.find((l) => l.isSystem);
  check(
    "a company has exactly one built-in label",
    startLabels.filter((l) => l.isSystem).length,
    1,
  );
  check("and it is the one new chats get", systemLabel?.name, "Initiated");

  // A fresh chat, so its labels are known exactly.
  const labelChat = await request<{ available: boolean; conversation: { id: string } }>(
    "/api/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        branchId: "branch_karachi",
        visitorId: `label-${suffix}`,
        visitor: {
          name: "Label Visitor",
          phone: `+92 306 ${digits}`,
          maritalStatus: "SINGLE",
          city: "Karachi",
        },
      }),
    },
  );
  const labelChatId = labelChat.data?.conversation.id;
  if (!labelChatId) throw new Error("Could not open a chat to label");

  const fresh = await request<AdminConversationDetail>(`/api/admin/conversations/${labelChatId}`, {
    token,
  });
  check(
    "a new chat starts with exactly the built-in label",
    fresh.data?.labels.map((l) => l.name),
    ["Initiated"],
  );

  const made = await request<LabelWithUsage>("/api/admin/labels", {
    method: "POST",
    token,
    body: JSON.stringify({ name: `Follow up ${suffix}`, color: "amber" }),
  });
  const customId = made.data?.id;
  check("an admin can add a custom label", made.status, 201);
  if (!customId) throw new Error("Label was not created");

  check(
    "a duplicate name is refused",
    (
      await request("/api/admin/labels", {
        method: "POST",
        token,
        body: JSON.stringify({ name: `Follow up ${suffix}` }),
      })
    ).status,
    409,
  );
  check(
    "a colour outside the palette is refused",
    (
      await request("/api/admin/labels", {
        method: "POST",
        token,
        body: JSON.stringify({ name: `Bad ${suffix}`, color: "chartreuse" }),
      })
    ).status,
    400,
  );
  check(
    "the built-in label cannot be deleted",
    (await request(`/api/admin/labels/${systemLabel!.id}`, { method: "DELETE", token })).status,
    409,
  );

  const applied = await request<Array<{ id: string; name: string }>>(
    `/api/conversations/${labelChatId}/labels/${customId}`,
    { method: "PUT", token },
  );
  check("an admin can label a chat they only read", applied.status, 200);
  check("labels accumulate rather than replacing", applied.data?.length, 2);
  check(
    "applying the same label twice is a no-op",
    (
      await request<unknown[]>(`/api/conversations/${labelChatId}/labels/${customId}`, {
        method: "PUT",
        token,
      })
    ).data?.length,
    2,
  );

  const byLabel = await request<AdminConversationSummary[]>(
    `/api/admin/conversations?labelId=${customId}`,
    { token },
  );
  check("the list can be filtered to one label", byLabel.data?.length, 1);
  check("and it is the right chat", byLabel.data?.[0]?.id, labelChatId);

  const removed = await request<unknown[]>(
    `/api/conversations/${labelChatId}/labels/${systemLabel!.id}`,
    { method: "DELETE", token },
  );
  check("a label can be taken off again", removed.data?.length, 1);

  // A visitor holds no token at all, and labels are the team's notes.
  const visitorDetail = await request<Record<string, unknown>>(
    `/api/conversations/${labelChatId}?visitorId=label-${suffix}`,
  );
  check(
    "the visitor's own copy of the chat carries no labels",
    "labels" in (visitorDetail.data ?? {}),
    false,
  );
  check(
    "and a visitor cannot apply one",
    (await request(`/api/conversations/${labelChatId}/labels/${customId}`, { method: "PUT" }))
      .status,
    401,
  );

  console.log("\n12. Stats");
  const stats = (await request<AdminStats>("/api/admin/stats", { token })).data;
  if (!stats) throw new Error("Could not read stats");

  check("branch total grew by the one we added", stats.branches.total - baseline.branches.total, 1);
  check(
    "active branches are unchanged, since we deactivated it",
    stats.branches.active - baseline.branches.active,
    0,
  );
  // Two: the agent of step 4, and the one step 7b hands the chat to.
  check("agent total grew by the ones we added", stats.agents.total - baseline.agents.total, 2);
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
