/**
 * Exercises the assignAgent routing rules against a real database.
 *
 * Run with:  pnpm --filter @repo/server check:routing
 *
 * This rewrites the Karachi branch's conversations. Run `pnpm db:seed`
 * afterwards to restore the documented demo state.
 */
import { prisma } from "@repo/db";
import { assignAgent } from "../src/services/routing.js";

const BRANCH_ID = "branch_karachi";
const AGENTS = {
  ahmed: "agent_ahmed_raza",
  bilal: "agent_bilal_khan",
  usman: "agent_usman_sheikh",
  hamza: "agent_hamza_iqbal",
} as const;

const NAMES: Record<string, string> = {
  [AGENTS.ahmed]: "Ahmed",
  [AGENTS.bilal]: "Bilal",
  [AGENTS.usman]: "Usman",
  [AGENTS.hamza]: "Hamza",
};

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}\n          expected ${JSON.stringify(expected)}`);
    console.log(`          actual   ${JSON.stringify(actual)}`);
  }
}

let visitorSeq = 0;
const nextVisitorId = () => `check-visitor-${Date.now()}-${++visitorSeq}`;

/** Stand-in pre-chat form details, so assignAgent has a visitor to record. */
const details = (visitorId: string) => ({
  name: `Test Visitor ${visitorSeq}`,
  email: `${visitorId}@example.com`,
  phone: "+92 300 0000000",
});

/** Opens a chat the way the widget does. */
const startChat = (visitorId = nextVisitorId()) =>
  assignAgent({ branchId: BRANCH_ID, visitorId, visitor: details(visitorId) });

/** Puts the branch into an exact online/load state. */
async function setBranchState(state: Array<[agentId: string, online: boolean, load: number]>) {
  await prisma.conversation.deleteMany({ where: { agent: { branchId: BRANCH_ID } } });

  for (const [agentId, isOnline, load] of state) {
    await prisma.agent.update({ where: { id: agentId }, data: { isOnline } });
    for (let i = 0; i < load; i += 1) {
      const visitorId = nextVisitorId();
      await prisma.visitor.create({ data: { id: visitorId, ...details(visitorId) } });
      await prisma.conversation.create({
        data: { agentId, visitorId, status: "ACTIVE" },
      });
    }
  }
}

async function loads(): Promise<Record<string, number>> {
  const rows = await prisma.agent.findMany({
    where: { branchId: BRANCH_ID },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      _count: { select: { conversations: { where: { status: "ACTIVE" } } } },
    },
  });
  return Object.fromEntries(rows.map((r) => [NAMES[r.id] ?? r.id, r._count.conversations]));
}

const assignedTo = (result: Awaited<ReturnType<typeof assignAgent>>): string =>
  result.available ? (NAMES[result.conversation.agentId] ?? result.conversation.agentId) : "NONE";

async function main(): Promise<void> {
  console.log("\n1. Lowest active count wins");
  await setBranchState([
    [AGENTS.ahmed, true, 2],
    [AGENTS.bilal, true, 1],
    [AGENTS.usman, false, 0],
    [AGENTS.hamza, true, 3],
  ]);
  check("Ahmed 2 / Bilal 1 / Usman offline / Hamza 3 -> Bilal", assignedTo(
    await startChat(),
  ), "Bilal");

  console.log("\n2. Deterministic tie-break (Ahmed 2 / Bilal 2 / Hamza 3)");
  check("earlier-created agent wins the tie -> Ahmed", assignedTo(
    await startChat(),
  ), "Ahmed");

  console.log("\n3. An offline agent is skipped");
  await setBranchState([
    [AGENTS.ahmed, true, 2],
    [AGENTS.bilal, false, 2],
    [AGENTS.usman, false, 0],
    [AGENTS.hamza, true, 3],
  ]);
  check("Bilal offline with the lowest load -> Ahmed", assignedTo(
    await startChat(),
  ), "Ahmed");

  console.log("\n4. Nobody online");
  await setBranchState([
    [AGENTS.ahmed, false, 0],
    [AGENTS.bilal, false, 0],
    [AGENTS.usman, false, 0],
    [AGENTS.hamza, false, 0],
  ]);
  const unavailable = await startChat();
  check("no conversation is created", unavailable.available, false);
  check(
    "message is returned",
    unavailable.available === false ? unavailable.message : null,
    "No agents are currently available.",
  );
  check("conversation count unchanged", await prisma.conversation.count({
    where: { agent: { branchId: BRANCH_ID } },
  }), 0);

  console.log("\n5. A returning visitor resumes rather than duplicating");
  await setBranchState([
    [AGENTS.ahmed, true, 0],
    [AGENTS.bilal, true, 0],
    [AGENTS.usman, false, 0],
    [AGENTS.hamza, true, 0],
  ]);
  const visitorId = nextVisitorId();
  const first = await startChat(visitorId);
  const second = await startChat(visitorId);
  check("second call is flagged as resumed", second.available && second.resumed, true);
  check(
    "same conversation id",
    first.available && second.available && first.conversation.id === second.conversation.id,
    true,
  );
  check("only one conversation exists", await prisma.conversation.count({
    where: { agent: { branchId: BRANCH_ID } },
  }), 1);

  console.log("\n6. Concurrent visitors (the race)");
  await setBranchState([
    [AGENTS.ahmed, true, 0],
    [AGENTS.bilal, true, 0],
    [AGENTS.usman, false, 0],
    [AGENTS.hamza, true, 0],
  ]);
  const CONCURRENT = 9;
  await Promise.all(
    Array.from({ length: CONCURRENT }, () => startChat()),
  );
  const spread = await loads();
  console.log(`          distribution: ${JSON.stringify(spread)}`);
  check("every visitor was assigned", Object.values(spread).reduce((a, b) => a + b, 0), CONCURRENT);
  check(
    "load is evenly balanced across the 3 online agents",
    [spread.Ahmed, spread.Bilal, spread.Hamza].sort(),
    [3, 3, 3],
  );
  check("the offline agent received nothing", spread.Usman, 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("Run `pnpm db:seed` to restore the demo data.\n");
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
