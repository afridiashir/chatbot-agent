-- Replying to a specific message: a message may quote an earlier one in the
-- same conversation. ON DELETE SET NULL so removing the quoted message leaves
-- the reply standing, without its quote.
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
