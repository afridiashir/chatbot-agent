-- Branch admins.
--
-- An admin with a branchId is confined to that branch; one without is a company
-- admin, which is what every existing admin already is, so no backfill is
-- needed. isActive lets a company admin revoke access without deleting history.

ALTER TABLE "Admin" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Admin" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Admin_branchId_idx" ON "Admin"("branchId");

ALTER TABLE "Admin" ADD CONSTRAINT "Admin_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
