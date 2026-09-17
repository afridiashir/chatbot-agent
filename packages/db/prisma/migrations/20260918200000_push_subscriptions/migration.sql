-- Web Push subscriptions. One row per browser that agreed to be notified,
-- keyed by the endpoint the push service gave it. `visitorId` is set for the
-- hosted chat page; `agentId` is for the dashboard, which comes next.
CREATE TABLE "PushSubscription" (
  "id"        TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "visitorId" TEXT,
  "agentId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_visitorId_idx" ON "PushSubscription"("visitorId");
CREATE INDEX "PushSubscription_agentId_idx" ON "PushSubscription"("agentId");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
