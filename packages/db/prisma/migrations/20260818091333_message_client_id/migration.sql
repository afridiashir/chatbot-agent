-- Idempotency key for queued sends. Nullable, so existing rows are untouched;
-- Postgres does not treat NULLs as duplicates, so the unique index is safe to
-- add without a backfill.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_clientId_key" ON "Message"("clientId");
