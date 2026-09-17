/**
 * Production first run: creates the company and its first company admin, and
 * nothing else. Unlike seed.ts it adds no demo data and deletes nothing, and it
 * refuses to run once any admin exists, so running it twice is harmless.
 *
 *   COMPANY_NAME="Acme" ADMIN_EMAIL=owner@acme.com ADMIN_NAME="Owner" tsx prisma/bootstrap.ts
 *
 * ADMIN_PASSWORD is optional; without it a strong one is generated and printed
 * once. Branches and agents are then added from the dashboard.
 */
import { randomBytes } from "node:crypto";
import { hashPassword, prisma } from "../src/index.js";

const companyName = process.env.COMPANY_NAME?.trim();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminName = process.env.ADMIN_NAME?.trim() || "Company admin";

if (!companyName || !adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
  console.error("Set COMPANY_NAME and a valid ADMIN_EMAIL.");
  process.exit(1);
}

const existing = await prisma.admin.count();
if (existing > 0) {
  console.log(`Already bootstrapped (${existing} admin account(s) exist). Nothing changed.`);
  await prisma.$disconnect();
  process.exit(0);
}

const generated = !process.env.ADMIN_PASSWORD;
const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const company = await prisma.company.create({ data: { name: companyName } });
await prisma.admin.create({
  data: {
    companyId: company.id,
    branchId: null,
    name: adminName,
    email: adminEmail,
    passwordHash: await hashPassword(password),
  },
});

console.log(`Created company "${companyName}" and company admin ${adminEmail}.`);
if (generated) {
  console.log(`Password (shown once, change it after signing in): ${password}`);
}
await prisma.$disconnect();
