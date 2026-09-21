-- Labels an agent or admin puts on a conversation. A chat can carry several at
-- once, and the set of labels is managed per company rather than typed per
-- chat, so "Sold" is one label and not three spellings of one.
--
-- Additive: nothing is dropped, and every existing conversation comes out of
-- this with the "Initiated" label it would have been given had the feature
-- existed when it started.

CREATE TABLE "Label" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "color"     TEXT NOT NULL DEFAULT 'grey',
    "isSystem"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Label_companyId_name_key" ON "Label"("companyId", "name");
CREATE INDEX "Label_companyId_idx" ON "Label"("companyId");

ALTER TABLE "Label" ADD CONSTRAINT "Label_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConversationLabel" (
    "conversationId" TEXT NOT NULL,
    "labelId"        TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationLabel_pkey" PRIMARY KEY ("conversationId", "labelId")
);

CREATE INDEX "ConversationLabel_labelId_idx" ON "ConversationLabel"("labelId");

ALTER TABLE "ConversationLabel" ADD CONSTRAINT "ConversationLabel_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationLabel" ADD CONSTRAINT "ConversationLabel_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every company gets the one label the application depends on. `isSystem`
-- keeps it from being deleted; it can still be renamed or recoloured.
INSERT INTO "Label" ("id", "companyId", "name", "color", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'Initiated', 'grey', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "name") DO NOTHING;

-- Backfill: conversations that already exist were all, at some point,
-- initiated. Dated to when the chat started rather than to now, so the label's
-- age is not a lie about when it was applied.
INSERT INTO "ConversationLabel" ("conversationId", "labelId", "createdAt")
SELECT conv."id", l."id", conv."createdAt"
FROM "Conversation" conv
JOIN "Agent" a  ON a."id" = conv."agentId"
JOIN "Branch" b ON b."id" = a."branchId"
JOIN "Label" l  ON l."companyId" = b."companyId" AND l."isSystem"
ON CONFLICT ("conversationId", "labelId") DO NOTHING;
