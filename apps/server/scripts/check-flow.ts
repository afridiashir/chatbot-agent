/**
 * Full-flow acceptance test.
 *
 * Everything here goes through the public HTTP API and Socket.IO — no direct
 * database access — so it exercises the system the way the widget and dashboard
 * actually do, including authentication and authorisation.
 *
 * Start the API first (`pnpm --filter @repo/server dev`), then run:
 *   pnpm --filter @repo/server check:flow
 *
 * It rearranges the Karachi branch. Run `pnpm db:seed` afterwards to restore
 * the documented demo state.
 */
import { io as connect, type Socket } from "socket.io-client";
import type {
  Agent,
  AgentWithLoad,
  AssignmentResult,
  ClientToServerEvents,
  Conversation,
  ConversationSummary,
  Message,
  PublicAgentProfile,
  VisitorLookupResult,
  ServerToClientEvents,
} from "@repo/types";

const API = process.env.API_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SEED_AGENT_PASSWORD ?? "";
const BRANCH_ID = "branch_karachi";

const AHMED = "agent_ahmed_raza";
const BILAL = "agent_bilal_khan";
const USMAN = "agent_usman_sheikh";
const HAMZA = "agent_hamza_iqbal";

const NAMES: Record<string, string> = {
  [AHMED]: "Ahmed",
  [BILAL]: "Bilal",
  [USMAN]: "Usman",
  [HAMZA]: "Hamza",
};

const EMAILS: Record<string, string> = {
  [AHMED]: "ahmed.raza@acme.example",
  [BILAL]: "bilal.khan@acme.example",
  [USMAN]: "usman.sheikh@acme.example",
  [HAMZA]: "hamza.iqbal@acme.example",
};

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

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

const tokens = new Map<string, string>();

async function signIn(agentId: string): Promise<string> {
  const cached = tokens.get(agentId);
  if (cached) return cached;

  const res = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAILS[agentId], password: PASSWORD }),
  });
  if (!res.data) throw new Error(`Could not sign in as ${agentId}: ${res.message}`);

  tokens.set(agentId, res.data.token);
  return res.data.token;
}

const setOnline = async (agentId: string, isOnline: boolean) =>
  request<Agent>(`/api/agents/${agentId}/status`, {
    method: "PATCH",
    token: await signIn(agentId),
    body: JSON.stringify({ isOnline }),
  });

let visitorSeq = 0;
const nextVisitorId = () => `flow-${Date.now()}-${++visitorSeq}`;

/** Stand-in pre-chat form details, required by POST /api/conversations. */
const visitorDetails = (visitorId: string) => ({
  name: `Test Visitor ${visitorId.slice(-5)}`,
  // Distinct per visitor: the phone is what identifies a lead now.
  phone: `+92 300 ${String(1000000 + visitorSeq).slice(-7)}`,
  maritalStatus: "SINGLE" as const,
  city: "Karachi",
});

const startChat = async (visitorId = nextVisitorId()) =>
  request<AssignmentResult>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      branchId: BRANCH_ID,
      visitorId,
      visitor: visitorDetails(visitorId),
    }),
  });

async function loads(): Promise<Record<string, number | "offline">> {
  const res = await request<AgentWithLoad[]>(`/api/branches/${BRANCH_ID}/agents`, {
    token: await signIn(AHMED),
  });
  const out: Record<string, number | "offline"> = {};
  for (const agent of res.data ?? []) {
    out[NAMES[agent.id] ?? agent.id] = agent.isOnline ? agent.activeConversationCount : "offline";
  }
  return out;
}

/** Closes every open conversation in the branch, returning all agents to zero. */
async function clearBranch(): Promise<void> {
  for (const agentId of [AHMED, BILAL, USMAN, HAMZA]) {
    const token = await signIn(agentId);
    const res = await request<ConversationSummary[]>(
      `/api/agents/${agentId}/conversations?status=ACTIVE`,
      { token },
    );
    for (const conversation of res.data ?? []) {
      await request(`/api/conversations/${conversation.id}/close`, { method: "POST", token });
    }
  }
}

/**
 * Builds an exact load per agent using only the public API: bring one agent
 * online at a time so routing has no choice about where each chat lands.
 */
async function arrange(state: Array<[agentId: string, online: boolean, load: number]>) {
  await clearBranch();
  for (const [agentId] of state) await setOnline(agentId, false);

  for (const [agentId, , load] of state) {
    if (load === 0) continue;
    await setOnline(agentId, true);
    for (let i = 0; i < load; i += 1) await startChat();
    await setOnline(agentId, false);
  }

  for (const [agentId, online] of state) await setOnline(agentId, online);
}

const assignedTo = (result?: AssignmentResult): string =>
  result?.available ? (NAMES[result.conversation.agentId] ?? result.conversation.agentId) : "NONE";

function waitFor<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 5000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${String(event)}`)),
      timeoutMs,
    );
    socket.once(event, ((payload: unknown) => {
      clearTimeout(timer);
      resolve(payload as Parameters<ServerToClientEvents[E]>[0]);
    }) as never);
  });
}

const connected = (socket: ClientSocket) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timed out")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

const emitAck = (socket: ClientSocket, conversationId: string, content: string) =>
  new Promise<{ ok: boolean; message?: string }>((resolve) => {
    socket.emit("message:send", { conversationId, content }, (result) =>
      resolve(result as { ok: boolean; message?: string }),
    );
  });

async function main(): Promise<void> {
  if (!PASSWORD) throw new Error("SEED_AGENT_PASSWORD is not set");

  console.log("\n=== Scenario from the spec ===");

  console.log("\n1. Branch A: Ahmed 2 / Bilal 1 / Usman offline / Hamza 3");
  await arrange([
    [AHMED, true, 2],
    [BILAL, true, 1],
    [USMAN, false, 0],
    [HAMZA, true, 3],
  ]);
  check("branch is in the expected state", await loads(), {
    Ahmed: 2,
    Bilal: 1,
    Usman: "offline",
    Hamza: 3,
  });

  const first = await startChat();
  check("visitor is routed to Bilal", assignedTo(first.data), "Bilal");
  check("a new conversation answers 201", first.status, 201);

  console.log("\n2. Next visitor, now Ahmed 2 / Bilal 2 / Hamza 3");
  check("loads after the first assignment", await loads(), {
    Ahmed: 2,
    Bilal: 2,
    Usman: "offline",
    Hamza: 3,
  });
  const second = await startChat();
  check("tie is broken deterministically towards Ahmed", assignedTo(second.data), "Ahmed");

  console.log("\n3. Bilal goes offline (Ahmed 2 / Bilal offline / Hamza 3)");
  await arrange([
    [AHMED, true, 2],
    [BILAL, false, 2],
    [USMAN, false, 0],
    [HAMZA, true, 3],
  ]);
  check("Bilal is offline while still holding chats", await loads(), {
    Ahmed: 2,
    Bilal: "offline",
    Usman: "offline",
    Hamza: 3,
  });
  const third = await startChat();
  check("visitor is routed to Ahmed", assignedTo(third.data), "Ahmed");

  console.log("\n4. Everyone offline");
  await clearBranch();
  for (const agentId of [AHMED, BILAL, USMAN, HAMZA]) await setOnline(agentId, false);

  const none = await startChat();
  check("no agent is available", none.data?.available, false);
  check(
    "the visitor gets a clear message",
    none.data?.available === false ? none.data.message : null,
    "No agents are currently available.",
  );
  check("it is not an HTTP error", none.status, 200);
  check("no phantom conversation was created", await loads(), {
    Ahmed: "offline",
    Bilal: "offline",
    Usman: "offline",
    Hamza: "offline",
  });

  console.log("\n=== End-to-end conversation lifecycle ===");

  await arrange([
    [AHMED, false, 0],
    [BILAL, true, 0],
    [USMAN, false, 0],
    [HAMZA, false, 0],
  ]);

  console.log("\n5. Visitor opens a chat");
  const visitorId = nextVisitorId();
  const opened = await startChat(visitorId);
  const conversation = opened.data?.available ? opened.data.conversation : null;
  if (!conversation) throw new Error("Expected a conversation to be created");
  check("routed to the only online agent", assignedTo(opened.data), "Bilal");

  const bilalToken = await signIn(BILAL);
  const agentSocket: ClientSocket = connect(API, {
    auth: { role: "AGENT", token: bilalToken },
    transports: ["websocket"],
  });
  const visitorSocket: ClientSocket = connect(API, {
    auth: { role: "VISITOR", visitorId },
    transports: ["websocket"],
  });
  await Promise.all([connected(agentSocket), connected(visitorSocket)]);

  await new Promise<void>((resolve) =>
    agentSocket.emit("conversation:join", { conversationId: conversation.id }, () => resolve()),
  );
  await new Promise<void>((resolve) =>
    visitorSocket.emit("conversation:join", { conversationId: conversation.id }, () => resolve()),
  );

  console.log("\n6. Real-time exchange");
  const agentHears = waitFor(agentSocket, "message:new");
  await emitAck(visitorSocket, conversation.id, "Hello, I need help with my order");
  const heard = (await agentHears) as Message;
  check("agent receives the visitor message", heard.content, "Hello, I need help with my order");

  const visitorHears = waitFor(visitorSocket, "message:new");
  await emitAck(agentSocket, conversation.id, "Of course — what is the order number?");
  const reply = (await visitorHears) as Message;
  check("visitor receives the agent reply", reply.senderType, "AGENT");

  console.log("\n7. Messages are durable, not just broadcast");
  const stored = await request<{ messages: Message[] }>(
    `/api/conversations/${conversation.id}?visitorId=${encodeURIComponent(visitorId)}`,
  );
  check("both messages are persisted", stored.data?.messages.length, 2);

  console.log("\n8. Refresh mid-chat resumes the same conversation");
  const resumed = await startChat(visitorId);
  check(
    "same conversation is returned",
    resumed.data?.available && resumed.data.conversation.id,
    conversation.id,
  );
  check("flagged as resumed", resumed.data?.available && resumed.data.resumed, true);
  check("resume answers 200, not 201", resumed.status, 200);

  console.log("\n8b. An open chat stays with its agent when they go offline");
  // The agent steps away and somebody else is the only one free. Their chat is
  // still theirs: it is not handed to whoever happens to be online, and the
  // visitor coming back lands in it rather than in a new one with a stranger.
  await setOnline(BILAL, false);
  await setOnline(AHMED, true);

  const whileAway = await startChat(visitorId);
  check(
    "the chat does not move to the agent who is online",
    whileAway.data?.available && whileAway.data.conversation.agentId,
    BILAL,
  );
  check(
    "it is the same conversation, not a new one",
    whileAway.data?.available && whileAway.data.conversation.id,
    conversation.id,
  );
  check(
    "and it is still open",
    whileAway.data?.available && whileAway.data.conversation.status,
    "ACTIVE",
  );

  // The message they send while nobody is watching still goes to that agent.
  const saidWhileAway = await request<Message>(`/api/conversations/${conversation.id}/messages`, {
    method: "POST",
    body: JSON.stringify({ senderType: "VISITOR", visitorId, content: "Are you there?" }),
  });
  check("a message sent while they are away is accepted", saidWhileAway.status, 201);

  const stillTheirs = await request<ConversationSummary[]>(`/api/agents/${BILAL}/conversations`, {
    token: bilalToken,
  });
  check(
    "and it waits in their own inbox",
    stillTheirs.data?.some((row) => row.id === conversation.id),
    true,
  );

  // Put the branch back the way step 9 expects to find it.
  await setOnline(AHMED, false);
  await setOnline(BILAL, true);

  console.log("\n9. Agent closes the conversation");
  check("Bilal is carrying one chat", await loads(), {
    Ahmed: "offline",
    Bilal: 1,
    Usman: "offline",
    Hamza: "offline",
  });

  const visitorNotified = waitFor(visitorSocket, "conversation:closed");
  const closed = await request<Conversation>(`/api/conversations/${conversation.id}/close`, {
    method: "POST",
    token: bilalToken,
  });
  check("status becomes CLOSED", closed.data?.status, "CLOSED");
  check(
    "visitor is notified in real time",
    ((await visitorNotified) as Conversation).status,
    "CLOSED",
  );

  console.log("\n10. A closed chat stops counting and stops accepting messages");
  check("Bilal is back to zero active", await loads(), {
    Ahmed: "offline",
    Bilal: 0,
    Usman: "offline",
    Hamza: "offline",
  });
  const afterClose = await emitAck(visitorSocket, conversation.id, "still there?");
  check("further messages are refused", afterClose.ok, false);

  const freshChat = await startChat(visitorId);
  check("the visitor can start a brand new chat", freshChat.status, 201);
  check(
    "and it is a different conversation",
    freshChat.data?.available && freshChat.data.conversation.id !== conversation.id,
    true,
  );

  for (const socket of [agentSocket, visitorSocket]) socket.close();

  console.log("\n11. The number is the identity: one person, several chats");
  // The widget opens on a list now, so a visitor is no longer one conversation.
  // Two agent links are two chats with two people, at the same time.
  const personPhone = `+92 300 ${String(Date.now()).slice(-7)}`;
  const deviceOne = nextVisitorId();
  const person = {
    name: "List Test Visitor",
    phone: personPhone,
    maritalStatus: "SINGLE" as const,
    city: "Karachi",
  };

  await setOnline(BILAL, true);
  await setOnline(HAMZA, true);

  const withBilal = await request<AssignmentResult>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ visitorId: deviceOne, agentId: BILAL, visitor: person }),
  });
  const withHamza = await request<AssignmentResult>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ visitorId: deviceOne, agentId: HAMZA, visitor: person }),
  });
  const bilalChat = withBilal.data?.available ? withBilal.data.conversation.id : "";
  const hamzaChat = withHamza.data?.available ? withHamza.data.conversation.id : "";
  check("a second agent's link opens a second chat", bilalChat !== hamzaChat, true);
  check("and both are open at once", [!!bilalChat, !!hamzaChat], [true, true]);

  // A plain chat, with no agent named, continues one they already have rather
  // than handing them a third stranger.
  const plain = await request<AssignmentResult>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ visitorId: deviceOne, visitor: person }),
  });
  check(
    "a plain chat continues one of them instead of starting a third",
    plain.data?.available && [bilalChat, hamzaChat].includes(plain.data.conversation.id),
    true,
  );

  console.log("\n11b. A second device finds them by number alone");
  const deviceTwo = nextVisitorId();
  const lookup = await request<VisitorLookupResult>("/api/conversations/lookup", {
    method: "POST",
    body: JSON.stringify({ phone: personPhone, visitorId: deviceTwo }),
  });
  check("the lookup knows who they are", lookup.data?.visitor?.name, person.name);
  const found = (lookup.data?.conversations ?? []).map((row) => row.id).sort();
  check("and returns both of their chats", found, [bilalChat, hamzaChat].sort());
  check(
    "each one says which agent it is with",
    (lookup.data?.conversations ?? []).every((row) => Boolean(row.agent.name && row.branch.name)),
    true,
  );

  const fromNewDevice = await request<{ messages: Message[] }>(
    `/api/conversations/${bilalChat}?visitorId=${deviceTwo}`,
  );
  check("a device that has never seen the chat can open it", fromNewDevice.status, 200);

  console.log("\n11c. Somebody else's number opens nothing");
  const strangerDevice = nextVisitorId();
  await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      visitorId: strangerDevice,
      visitor: {
        ...person,
        name: "Someone Else",
        phone: `+92 302 ${String(Date.now()).slice(-7)}`,
      },
    }),
  });
  check(
    "a different number cannot read the chat",
    (await request(`/api/conversations/${bilalChat}?visitorId=${strangerDevice}`)).status,
    403,
  );
  const nobody = await request<VisitorLookupResult>("/api/conversations/lookup", {
    method: "POST",
    body: JSON.stringify({ phone: "+92 398 7654321", visitorId: nextVisitorId() }),
  });
  check("a number we have never seen has nothing", nobody.data?.conversations.length, 0);
  check("and is not claimed to be anyone", nobody.data?.visitor, null);

  check(
    "a number that is not a number is refused",
    (
      await request("/api/conversations/lookup", {
        method: "POST",
        body: JSON.stringify({ phone: "0300 12", visitorId: nextVisitorId() }),
      })
    ).status,
    400,
  );

  console.log("\n12. An agent can hand a visitor to a colleague");
  // What the "share a colleague" picker is filled from. It goes into a chat, so
  // it is the visitor-facing card and nothing more.
  const mine = await request<PublicAgentProfile[]>(`/api/agents/${BILAL}/colleagues`, {
    token: bilalToken,
  });
  const offered = (mine.data ?? []).map((agent) => agent.name).sort();
  check("the list is their own branch", offered, ["Ahmed Raza", "Hamza Iqbal", "Usman Sheikh"]);
  check("it does not offer them themselves", offered.includes("Bilal Khan"), false);
  check("nor anybody from another branch", offered.includes("Sana Gul"), false);
  check(
    "and it carries no email address, which is also a login",
    JSON.stringify(mine.data ?? []).includes("@"),
    false,
  );
  check(
    "whoever is free is offered first",
    (mine.data ?? []).every((agent, index, all) =>
      index === 0 ? true : Number(all[index - 1]!.isOnline) >= Number(agent.isOnline),
    ),
    true,
  );

  check(
    "an agent cannot list somebody else's colleagues",
    (await request(`/api/agents/${HAMZA}/colleagues`, { token: bilalToken })).status,
    403,
  );
  check(
    "and a visitor cannot list them at all",
    (await request(`/api/agents/${BILAL}/colleagues`)).status,
    401,
  );

  console.log("\n13. The team files a client under their own name for them");
  // A matchmaker keeps people as "Umar -M1- 8344- LHR". It is the person's
  // label, not the conversation's, and not something the person is shown.
  const labelPhone = `+92 300 ${String(Date.now()).slice(-7)}`;
  const labelDevice = nextVisitorId();
  const labelled = {
    name: "Umar Farooq",
    phone: labelPhone,
    maritalStatus: "SINGLE" as const,
    city: "Lahore",
  };

  await setOnline(BILAL, true);
  const firstWith = await request<AssignmentResult>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ visitorId: labelDevice, agentId: BILAL, visitor: labelled }),
  });
  const secondWith = await request<AssignmentResult>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ visitorId: labelDevice, agentId: HAMZA, visitor: labelled }),
  });
  const chatA = firstWith.data?.available ? firstWith.data.conversation.id : "";
  const chatB = secondWith.data?.available ? secondWith.data.conversation.id : "";

  const named = await request<{ displayName: string | null }>(
    `/api/conversations/${chatA}/visitor`,
    {
      method: "PATCH",
      token: bilalToken,
      body: JSON.stringify({ displayName: "Umar -M1- 8344- LHR" }),
    },
  );
  check("an agent can label their client", named.data?.displayName, "Umar -M1- 8344- LHR");

  const inbox = await request<ConversationSummary[]>(`/api/agents/${BILAL}/conversations`, {
    token: bilalToken,
  });
  const row = inbox.data?.find((entry) => entry.id === chatA);
  check("it shows in their inbox", row?.visitor.displayName, "Umar -M1- 8344- LHR");
  check("and the name they gave is untouched beside it", row?.visitor.name, "Umar Farooq");

  // The label is the person's, so the other agent's chat carries it too.
  const hamzaInbox = await request<ConversationSummary[]>(`/api/agents/${HAMZA}/conversations`, {
    token: await signIn(HAMZA),
  });
  check(
    "their other chat is labelled too, without being told twice",
    hamzaInbox.data?.find((entry) => entry.id === chatB)?.visitor.displayName,
    "Umar -M1- 8344- LHR",
  );

  // And the person it describes is never shown it.
  const theirOwnCopy = await request<Record<string, unknown>>(
    `/api/conversations/${chatA}?visitorId=${labelDevice}`,
  );
  check(
    "the visitor's own copy does not carry it",
    "displayName" in ((theirOwnCopy.data?.visitor as Record<string, unknown>) ?? {}),
    false,
  );
  check(
    "and the shorthand appears nowhere in it",
    JSON.stringify(theirOwnCopy.data ?? {}).includes("M1- 8344"),
    false,
  );
  // 401 rather than 403: the endpoint takes no visitor id at all, so there is
  // no way for a visitor to be the caller in the first place.
  check(
    "a visitor cannot set one either",
    (
      await request(`/api/conversations/${chatA}/visitor`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: "nice try", visitorId: labelDevice }),
      })
    ).status,
    401,
  );

  const cleared = await request<{ displayName: string | null }>(
    `/api/conversations/${chatA}/visitor`,
    { method: "PATCH", token: bilalToken, body: JSON.stringify({ displayName: "" }) },
  );
  check("an empty label clears it", cleared.data?.displayName, null);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("Run `pnpm db:seed` to restore the demo data.\n");
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
