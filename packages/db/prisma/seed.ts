import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { hashPassword } from "../src/password.js";
import { BRANCHES, COMPANY, VISITORS, type SeedConversation } from "./seed-data.js";

// The monorepo keeps a single root .env; Prisma 7 does not load it for us.
loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env first");
}

/** Reads a required seed variable, failing loudly rather than seeding junk. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in .env before seeding`);
  return value;
}

const agentPassword = requireEnv("SEED_AGENT_PASSWORD");
const adminEmail = requireEnv("SEED_ADMIN_EMAIL").trim().toLowerCase();
const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Demo traffic is spread across the last couple of days rather than pinned to a
 * fixed date, so the dashboard's "Today" / "Yesterday" separators and its
 * relative timestamps show something meaningful straight after seeding.
 */
const BASE_TIME = new Date(Date.now() - 30 * 60 * 60 * 1000);
let tick = 0;
const nextTimestamp = (): Date => new Date(BASE_TIME.getTime() + ++tick * 9 * 60_000);

async function seedConversation(
  agentId: string,
  branchId: string,
  conversation: SeedConversation,
): Promise<void> {
  const createdAt = nextTimestamp();
  const isClosed = conversation.status === "CLOSED";

  const messages = conversation.messages.map((message) => ({
    senderType: message.senderType,
    content: message.content,
    createdAt: nextTimestamp(),
  }));

  // `updatedAt` means "last activity" everywhere else in the app, so seed it to
  // match the final message instead of letting @updatedAt stamp it with now.
  const lastActivity = messages.at(-1)?.createdAt ?? createdAt;

  const created = await prisma.conversation.create({
    data: {
      agentId,
      visitorId: conversation.visitorId,
      status: conversation.status,
      createdAt,
      updatedAt: lastActivity,
      closedAt: isClosed ? nextTimestamp() : null,
      messages: { create: messages },
    },
  });

  // Every conversation is a lead. Routing records one on each pre-chat form
  // submission; seeded chats skip routing, so record the same rows here.
  const visitor = VISITORS.find((v) => v.id === conversation.visitorId);
  if (!visitor)
    throw new Error(`Seed conversation references unknown visitor ${conversation.visitorId}`);
  const email = visitor.email.toLowerCase();
  const lead = await prisma.lead.upsert({
    where: { companyId_email: { companyId: COMPANY.id, email } },
    create: {
      companyId: COMPANY.id,
      email,
      name: visitor.name,
      phone: visitor.phone,
      branchId,
      createdAt,
    },
    update: { name: visitor.name, phone: visitor.phone, branchId },
    select: { id: true },
  });
  await prisma.enquiry.create({
    data: { leadId: lead.id, branchId, conversationId: created.id, answered: true, createdAt },
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database");
  }

  // Conversations and messages are demo traffic — always rebuilt so repeated
  // seeds produce the exact load figures the routing example depends on.
  // Cascades handle messages.
  await prisma.conversation.deleteMany({});
  // Visitors are demo traffic; conversations cascade from them.
  await prisma.visitor.deleteMany({});

  // The demo visitors' own leads are rebuilt with their conversations, so a
  // reseed does not stack a fresh enquiry onto the same fake person each time.
  await prisma.lead.deleteMany({
    where: { companyId: COMPANY.id, email: { in: VISITORS.map((v) => v.email.toLowerCase()) } },
  });

  // Every other lead and its enquiry history is deliberately NOT cleared. They are a
  // record of real people who got in touch, accumulated over time, and wiping
  // them on every reseed would defeat the point of keeping the history at all.
  // Use `pnpm db:reset` for a genuinely empty database.

  // Anything an admin (or a test run) created is removed, so "seeded" really
  // does mean the exact state this file describes. Deleting a branch cascades
  // to its agents.
  const seedBranchIds = BRANCHES.map((branch) => branch.id);
  const seedAgentIds = BRANCHES.flatMap((branch) => branch.agents.map((agent) => agent.id));
  await prisma.branch.deleteMany({ where: { id: { notIn: seedBranchIds } } });
  await prisma.agent.deleteMany({ where: { id: { notIn: seedAgentIds } } });

  for (const visitor of VISITORS) {
    await prisma.visitor.create({ data: visitor });
  }

  await prisma.company.upsert({
    where: { id: COMPANY.id },
    create: COMPANY,
    update: { name: COMPANY.name },
  });

  // Hashing is deliberately slow, so derive each password once and reuse it
  // across the demo accounts rather than per agent.
  const agentPasswordHash = await hashPassword(agentPassword);
  const adminPasswordHash = await hashPassword(adminPassword);

  await prisma.admin.upsert({
    where: { email: adminEmail },
    create: {
      id: "admin_root",
      companyId: COMPANY.id,
      name: "Acme Administrator",
      email: adminEmail,
      passwordHash: adminPasswordHash,
    },
    update: { companyId: COMPANY.id, passwordHash: adminPasswordHash },
  });

  let agentCount = 0;
  let conversationCount = 0;

  for (const branch of BRANCHES) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      create: { id: branch.id, name: branch.name, companyId: COMPANY.id, isActive: true },
      update: { name: branch.name, companyId: COMPANY.id, isActive: true },
    });

    for (const agent of branch.agents) {
      await prisma.agent.upsert({
        where: { id: agent.id },
        create: {
          id: agent.id,
          branchId: branch.id,
          name: agent.name,
          email: agent.email,
          passwordHash: agentPasswordHash,
          isOnline: agent.isOnline,
          isActive: true,
        },
        update: {
          branchId: branch.id,
          name: agent.name,
          email: agent.email,
          passwordHash: agentPasswordHash,
          isOnline: agent.isOnline,
          isActive: true,
        },
      });
      agentCount += 1;

      for (const conversation of agent.conversations) {
        await seedConversation(agent.id, branch.id, conversation);
        conversationCount += 1;
      }
    }
  }

  // One branch admin per seeded branch, sharing the admin password, so the
  // branch-scoped view can be tried straight after seeding.
  for (const branch of BRANCHES) {
    const email = `${branch.id.replace(/^branch_/, "")}.admin@acme.example`;
    await prisma.admin.upsert({
      where: { email },
      create: {
        id: `admin_${branch.id}`,
        companyId: COMPANY.id,
        branchId: branch.id,
        name: `${branch.name} Branch Admin`,
        email,
        passwordHash: adminPasswordHash,
      },
      update: {
        companyId: COMPANY.id,
        branchId: branch.id,
        isActive: true,
        passwordHash: adminPasswordHash,
      },
    });
  }

  console.log(
    `Seeded ${COMPANY.name}: ${BRANCHES.length} branches, ${agentCount} agents, ` +
      `${conversationCount} conversations, ${VISITORS.length} visitors, 1 admin (${adminEmail}).`,
  );

  const summary = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      agents: {
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          isOnline: true,
          _count: { select: { conversations: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  for (const branch of summary) {
    console.log(`\n${branch.name}`);
    for (const agent of branch.agents) {
      const status = agent.isOnline ? "online " : "offline";
      console.log(`  ${agent.name.padEnd(16)} ${status}  ${agent._count.conversations} active`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
