-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_email_idx" ON "Visitor"("email");

-- Backfill. Conversations created before the pre-chat form reference visitor
-- ids that have no details, so give each one a placeholder row rather than
-- dropping the history. Empty contact fields are honest: we never asked.
INSERT INTO "Visitor" ("id", "name", "email", "phone", "createdAt", "updatedAt")
SELECT DISTINCT c."visitorId", 'Unknown visitor', '', '', NOW(), NOW()
FROM "Conversation" c
ON CONFLICT ("id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
