-- An admin can now step into a chat and reply in the agent's place.
--
-- The message is still stored as `AGENT`, because that is who the visitor has
-- been talking to and who they should keep seeing. This column is the record of
-- who actually typed it, and is never serialised to a visitor.
--
-- Additive: existing messages get NULL, which reads correctly as "the agent
-- wrote this themselves".

ALTER TABLE "Message" ADD COLUMN "sentByAdminId" TEXT;

CREATE INDEX "Message_sentByAdminId_idx" ON "Message"("sentByAdminId");

-- SetNull, not Cascade: removing an admin must not delete the conversation
-- history they took part in, only the attribution on it.
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentByAdminId_fkey"
    FOREIGN KEY ("sentByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
