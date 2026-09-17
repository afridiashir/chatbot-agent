-- Reacting to a message with a single emoji, as in WhatsApp. One reaction per
-- side per message: reacting again replaces it, and the same emoji twice
-- removes it. Deleting the message takes its reactions with it.
CREATE TABLE "Reaction" (
  "id"         TEXT NOT NULL,
  "messageId"  TEXT NOT NULL,
  "senderType" "SenderType" NOT NULL,
  "emoji"      TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Reaction_messageId_senderType_key" ON "Reaction"("messageId", "senderType");

ALTER TABLE "Reaction"
  ADD CONSTRAINT "Reaction_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
