import { Prisma } from "@repo/db";
import type { AdminTokenPayload } from "./auth.js";
import { forbidden, notFound } from "./http.js";

/**
 * One place that decides what an admin may see.
 *
 * A company admin (`branchId === null`) sees every branch of their company. A
 * branch admin sees exactly one branch. Every admin query builds its filter
 * from these helpers rather than reading `branchId` itself, so a new endpoint
 * cannot quietly forget the branch half of the rule.
 */

export const isBranchAdmin = (actor: AdminTokenPayload) => actor.branchId !== null;

/** Prisma `where` for branches this admin may see. */
export function branchScope(actor: AdminTokenPayload) {
  return {
    companyId: actor.companyId,
    ...(actor.branchId ? { id: actor.branchId } : {}),
  };
}

/** Prisma `where` for enquiries this admin may see (leads are shared across branches). */
export function enquiryScope(actor: AdminTokenPayload) {
  return {
    lead: { companyId: actor.companyId },
    ...(actor.branchId ? { branchId: actor.branchId } : {}),
  };
}

/** Raw-SQL fragment: `AND <column> = branch`, or nothing for a company admin. */
export function sqlInBranch(actor: AdminTokenPayload, column: Prisma.Sql): Prisma.Sql {
  return actor.branchId ? Prisma.sql`AND ${column} = ${actor.branchId}` : Prisma.empty;
}

/** Branches, branch admins and other admins are managed company-wide only. */
export function requireCompanyAdmin(actor: AdminTokenPayload): void {
  if (isBranchAdmin(actor)) throw forbidden("Only a company admin can do that");
}

/**
 * The branch a request may act on. A branch admin can only ever name their own;
 * anything else reads as not found, so other branches cannot be probed.
 */
export function assertBranchAllowed(actor: AdminTokenPayload, branchId: string): void {
  if (actor.branchId && actor.branchId !== branchId) throw notFound("Branch not found");
}
