/**
 * Sets a new password for an admin account, for when it has been lost.
 * Passwords are stored as hashes, so there is nothing to recover; this
 * replaces it.
 *
 *   tsx prisma/reset-admin-password.ts                  list admin accounts
 *   ADMIN_EMAIL=owner@acme.com tsx prisma/reset-admin-password.ts
 *
 * NEW_PASSWORD is optional; without it a strong one is generated and printed
 * once. A deactivated account is reactivated, since a password reset for an
 * account that can't sign in would be pointless.
 */
import { randomBytes } from "node:crypto";
import { hashPassword, prisma } from "../src/index.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

if (!email) {
  const admins = await prisma.admin.findMany({
    orderBy: [{ branchId: "asc" }, { email: "asc" }],
    select: { email: true, name: true, isActive: true, branch: { select: { name: true } } },
  });
  if (admins.length === 0) {
    console.log("No admin accounts yet. Run bootstrap first.");
  } else {
    console.log("Admin accounts:");
    for (const admin of admins) {
      const role = admin.branch ? `branch admin, ${admin.branch.name}` : "company admin";
      const state = admin.isActive ? "" : ", deactivated";
      console.log(`  ${admin.email}  (${admin.name}; ${role}${state})`);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

const admin = await prisma.admin.findUnique({ where: { email } });
if (!admin) {
  console.error(`No admin account with email ${email}.`);
  await prisma.$disconnect();
  process.exit(1);
}

const generated = !process.env.NEW_PASSWORD;
const password = process.env.NEW_PASSWORD || randomBytes(12).toString("base64url");
if (password.length < 8) {
  console.error("NEW_PASSWORD must be at least 8 characters.");
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.admin.update({
  where: { id: admin.id },
  data: { passwordHash: await hashPassword(password), isActive: true },
});

console.log(`Password reset for ${email}${admin.isActive ? "" : " (account reactivated)"}.`);
console.log(
  generated
    ? `New password (shown once, change it after signing in): ${password}`
    : "The password you provided is now set.",
);
await prisma.$disconnect();
