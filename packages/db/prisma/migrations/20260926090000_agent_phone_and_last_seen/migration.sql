-- Two things the team asked for, both optional and both additive.
--
-- `Agent.phone`: a number a visitor can call or message the person they are
-- chatting to. Nullable, because not every agent has one to give out, and the
-- widget only offers it where there is one.
--
-- `Visitor.lastSeenAt`: when they last had a chat open. Presence itself is
-- derived from live sockets and is not stored — a browser closed without
-- warning stops counting on its own — but "last seen" is a memory of the
-- moment the last of those sockets went, which has to be written down.
ALTER TABLE "Agent" ADD COLUMN "phone" TEXT;
ALTER TABLE "Visitor" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
