-- One row per approach from a lead, so the record reads as a history rather
-- than a pair of counters. The counters on Lead become derived and are dropped.

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "branchId" TEXT,
    "conversationId" TEXT,
    "answered" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Enquiry_leadId_createdAt_idx" ON "Enquiry"("leadId", "createdAt");
CREATE INDEX "Enquiry_branchId_createdAt_idx" ON "Enquiry"("branchId", "createdAt");
CREATE INDEX "Enquiry_answered_createdAt_idx" ON "Enquiry"("answered", "createdAt");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill. Existing leads only carry totals, so expand each into that many
-- rows: the earliest `missedCount` are marked unanswered. The exact timestamps
-- are unknowable, so they all inherit the lead's creation time rather than
-- inventing a spread that would read as real data.
INSERT INTO "Enquiry" ("id", "leadId", "branchId", "conversationId", "answered", "createdAt")
SELECT
    gen_random_uuid()::text,
    l."id",
    l."branchId",
    NULL,
    i > l."missedCount",
    l."createdAt"
FROM "Lead" l
CROSS JOIN LATERAL generate_series(1, GREATEST(l."enquiryCount", 0)) AS i;

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "enquiryCount";
ALTER TABLE "Lead" DROP COLUMN "missedCount";
DROP INDEX IF EXISTS "Lead_companyId_missedCount_idx";
