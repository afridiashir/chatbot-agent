-- Read receipts: delivered (grey double tick) and read (blue double tick).
ALTER TABLE "Message" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "readAt" TIMESTAMP(3);

-- History: a message the other side answered was, at the latest, seen when
-- they answered. Anything never answered stays at a single tick.
UPDATE "Message" AS m
SET "deliveredAt" = reply."at", "readAt" = reply."at"
FROM (
  SELECT earlier."id", MIN(later."createdAt") AS "at"
  FROM "Message" AS earlier
  JOIN "Message" AS later
    ON later."conversationId" = earlier."conversationId"
   AND later."senderType" <> earlier."senderType"
   AND later."createdAt" > earlier."createdAt"
  GROUP BY earlier."id"
) AS reply
WHERE m."id" = reply."id";
