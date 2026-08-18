/**
 * Drives the Socket.IO layer against a running server.
 *
 * Start the API first (`pnpm --filter @repo/server dev`), then run:
 *   pnpm --filter @repo/server check:realtime
 *
 * This changes Karachi agent availability and adds conversations. Run
 * `pnpm db:seed` afterwards to restore the documented demo state.
 */
import { io as connect, type Socket } from "socket.io-client";
import type {
  AgentStatusPayload,
  Agent,
  ClientToServerEvents,
  Conversation,
  ConversationWithAgent,
  Message,
  ServerToClientEvents,
  TypingPayload,
} from "@repo/types";

const API = process.env.API_URL ?? "http://localhost:4000";
const BRANCH_ID = "branch_karachi";
const PASSWORD = process.env.SEED_AGENT_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let passed = 0;
let failed = 0;

/** Tracked so a failed assertion cannot leave the process hanging on open handles. */
const sockets: ClientSocket[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
}

async function api<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { message: string } } }> {
  const { token, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const body = (await res.json()) as {
    ok: boolean;
    data?: T;
    error?: { message: string };
  };
  return { status: res.status, body };
}

/** Resolves with the next payload for `event`, or rejects on timeout. */
function waitFor<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 5000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`timed out waiting for "${String(event)}"`));
    }, timeoutMs);

    const handler = (payload: unknown) => {
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload as Parameters<ServerToClientEvents[E]>[0]);
    };

    socket.on(event, handler as never);
  });
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connection timed out")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const join = (socket: ClientSocket, conversationId: string) =>
  new Promise<{ ok: boolean; message?: string }>((resolve) => {
    socket.emit("conversation:join", { conversationId }, (result) =>
      resolve(result as { ok: boolean; message?: string }),
    );
  });

const send2 = (
  socket: ClientSocket,
  conversationId: string,
  content: string,
  clientId: string,
) =>
  new Promise<{ ok: boolean; message?: string }>((resolve) => {
    socket.emit("message:send", { conversationId, content, clientId }, (result) =>
      resolve(result as { ok: boolean; message?: string }),
    );
  });

const send = (socket: ClientSocket, conversationId: string, content: string) =>
  new Promise<{ ok: boolean; message?: string }>((resolve) => {
    socket.emit("message:send", { conversationId, content }, (result) =>
      resolve(result as { ok: boolean; message?: string }),
    );
  });

async function main(): Promise<void> {
  if (!PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("SEED_AGENT_PASSWORD, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }

  // The agent roster is agent-only, so sign in with a known seeded address
  // first and use that token to read it.
  const bootstrap = await api<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "bilal.khan@acme.example", password: PASSWORD }),
  });
  const bootstrapToken = bootstrap.body.data?.token;
  if (!bootstrapToken) throw new Error("Could not sign in as the seeded agent");

  const agentsRes = await api<Agent[]>(`/api/branches/${BRANCH_ID}/agents`, {
    token: bootstrapToken,
  });
  const agents = agentsRes.body.data ?? [];

  // Log every Karachi agent in so availability can be set precisely.
  const tokens = new Map<string, string>();
  for (const agent of agents) {
    const res = await api<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: agent.email, password: PASSWORD }),
    });
    if (res.body.data) tokens.set(agent.id, res.body.data.token);
  }

  const target = agents.find((a) => a.id === "agent_bilal_khan");
  if (!target) throw new Error("Expected Bilal in the Karachi branch");
  const targetToken = tokens.get(target.id);
  const otherId = "agent_ahmed_raza";
  const otherToken = tokens.get(otherId);
  if (!targetToken || !otherToken) throw new Error("Missing agent tokens");

  // Only the target is online, so routing is deterministic for this run.
  for (const agent of agents) {
    await api(`/api/agents/${agent.id}/status`, {
      method: "PATCH",
      token: tokens.get(agent.id),
      body: JSON.stringify({ isOnline: agent.id === target.id }),
    });
  }

  const agentSocket: ClientSocket = connect(API, {
    auth: { role: "AGENT", token: targetToken },
    transports: ["websocket"],
  });
  sockets.push(agentSocket);
  await connected(agentSocket);
  console.log("\n1. Handshake");
  check("agent socket connects with a valid token", agentSocket.connected);

  const rejected: ClientSocket = connect(API, {
    auth: { role: "AGENT", token: "not-a-real-token" },
    transports: ["websocket"],
  });
  const rejectedError = await connected(rejected)
    .then(() => null)
    .catch((e: Error) => e);
  check("a bad token is refused at handshake", rejectedError !== null);
  rejected.close();

  console.log("\n2. conversation:assigned reaches the agent inbox");
  const assignedPromise = waitFor(agentSocket, "conversation:assigned");
  const visitorId = `rt-visitor-${Date.now()}`;
  const created = await api<{ available: boolean; conversation: ConversationWithAgent }>(
    "/api/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        branchId: BRANCH_ID,
        visitorId,
        visitor: {
          name: "Realtime Test Visitor",
          email: `${visitorId}@example.com`,
          phone: "+92 300 0000000",
        },
      }),
    },
  );
  const conversation = created.body.data?.conversation;
  if (!conversation) throw new Error("Conversation was not created");

  const assigned = (await assignedPromise) as ConversationWithAgent;
  check("agent is notified without polling", assigned.id === conversation.id);
  check("routed to the only online agent", conversation.agentId === target.id);

  const visitorSocket: ClientSocket = connect(API, {
    auth: { role: "VISITOR", visitorId },
    transports: ["websocket"],
  });
  sockets.push(visitorSocket);
  await connected(visitorSocket);

  console.log("\n3. Room membership is access controlled");
  check("visitor joins its own conversation", (await join(visitorSocket, conversation.id)).ok);
  check("agent joins the conversation it owns", (await join(agentSocket, conversation.id)).ok);

  const intruder: ClientSocket = connect(API, {
    auth: { role: "VISITOR", visitorId: `rt-intruder-${Date.now()}` },
    transports: ["websocket"],
  });
  sockets.push(intruder);
  await connected(intruder);
  const intruderJoin = await join(intruder, conversation.id);
  check("an unrelated visitor cannot join", !intruderJoin.ok, `got: ${JSON.stringify(intruderJoin)}`);
  const intruderSend = await send(intruder, conversation.id, "let me in");
  check("an unrelated visitor cannot send", !intruderSend.ok);

  console.log("\n4. Messages flow both ways");
  const agentReceives = waitFor(agentSocket, "message:new");
  const sendAck = await send(visitorSocket, conversation.id, "Hello over websocket");
  check("visitor send is acknowledged", sendAck.ok);
  const gotByAgent = (await agentReceives) as Message;
  check("agent receives the visitor message", gotByAgent.content === "Hello over websocket");
  check("message is stamped VISITOR", gotByAgent.senderType === "VISITOR");

  const visitorReceives = waitFor(visitorSocket, "message:new");
  await api(`/api/conversations/${conversation.id}/messages`, {
    method: "POST",
    token: targetToken,
    body: JSON.stringify({ senderType: "AGENT", content: "Reply sent over REST" }),
  });
  const gotByVisitor = (await visitorReceives) as Message;
  check("a REST-sent reply still reaches the room", gotByVisitor.content === "Reply sent over REST");

  console.log("\n4b. Typing indicators");
  const typingHeard = waitFor(agentSocket, "typing:update");
  visitorSocket.emit("typing", { conversationId: conversation.id, isTyping: true });
  const typing = (await typingHeard) as TypingPayload;
  check("agent is told the visitor is typing", typing.isTyping && typing.senderType === "VISITOR");
  check("payload names the conversation", typing.conversationId === conversation.id);

  const stopHeard = waitFor(agentSocket, "typing:update");
  visitorSocket.emit("typing", { conversationId: conversation.id, isTyping: false });
  check("and told when they stop", ((await stopHeard) as TypingPayload).isTyping === false);

  // The sender must not receive its own notice back.
  const echoed = waitFor(visitorSocket, "typing:update", 1500).then(() => true).catch(() => false);
  visitorSocket.emit("typing", { conversationId: conversation.id, isTyping: true });
  check("the sender does not see its own typing", (await echoed) === false);

  // An outsider must not be able to inject typing into a room they never joined.
  const leaked = waitFor(agentSocket, "typing:update", 1500).then(() => true).catch(() => false);
  intruder.emit("typing", { conversationId: conversation.id, isTyping: true });
  check("a non-member cannot inject typing", (await leaked) === false);

  console.log("\n4c. Re-delivery of a queued message is idempotent");
  const key = `retry-${Date.now()}`;
  const firstTry = await send2(visitorSocket, conversation.id, "Sent once, delivered twice?", key);
  check("first delivery is accepted", firstTry.ok);

  // Exactly what a client does after a dropped connection: same key, again.
  const secondTry = await send2(visitorSocket, conversation.id, "Sent once, delivered twice?", key);
  check("retry is accepted rather than erroring", secondTry.ok);

  const afterRetry = await api<{ messages: Message[] }>(
    `/api/conversations/${conversation.id}?visitorId=${visitorId}`,
  );
  const dupes = (afterRetry.body.data?.messages ?? []).filter(
    (m) => m.content === "Sent once, delivered twice?",
  );
  check("only one copy was stored", dupes.length === 1, `found ${dupes.length}`);
  check("the stored copy carries the key", dupes[0]?.clientId === key);

  console.log("\n5. Messages are persisted, not just broadcast");
  const transcript = await api<{ messages: Message[] }>(
    `/api/conversations/${conversation.id}?visitorId=${visitorId}`,
  );
  const stored = transcript.body.data?.messages ?? [];
  check("every message is in PostgreSQL", stored.length === 3, `found ${stored.length}`);

  console.log("\n6. agent:status reaches admins, and only admins");
  const adminLogin = await api<{ token: string }>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const adminToken = adminLogin.body.data?.token;
  if (!adminToken) throw new Error("Admin login failed");

  const adminSocket: ClientSocket = connect(API, {
    auth: { role: "ADMIN", token: adminToken },
    transports: ["websocket"],
  });
  sockets.push(adminSocket);
  await connected(adminSocket);

  const adminHears = waitFor(adminSocket, "agent:status");
  // An agent socket must NOT receive this: availability across the company is
  // information for the admin view, not for other agents.
  const agentHeardStatus = waitFor(agentSocket, "agent:status", 2500)
    .then(() => true)
    .catch(() => false);

  await api(`/api/agents/${otherId}/status`, {
    method: "PATCH",
    token: otherToken,
    body: JSON.stringify({ isOnline: true }),
  });
  const status = (await adminHears) as AgentStatusPayload;
  check("status change reaches the admin socket", status.agentId === otherId && status.isOnline);
  check("an agent socket does not receive it", (await agentHeardStatus) === false);


  console.log("\n7. conversation:closed");
  const visitorClosed = waitFor(visitorSocket, "conversation:closed");
  await api(`/api/conversations/${conversation.id}/close`, {
    method: "POST",
    token: targetToken,
  });
  const closed = (await visitorClosed) as Conversation;
  check("visitor is told the chat closed", closed.status === "CLOSED");

  const afterClose = await send(visitorSocket, conversation.id, "still there?");
  check("sending into a closed chat is refused", !afterClose.ok, `got: ${JSON.stringify(afterClose)}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("Run `pnpm db:seed` to restore the demo data.\n");
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const socket of sockets) socket.close();
  });
