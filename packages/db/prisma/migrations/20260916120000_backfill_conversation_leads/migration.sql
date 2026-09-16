-- Every conversation is a lead.
--
-- Routing records a Lead and an Enquiry whenever a visitor submits the pre-chat
-- form, but conversations that reached the database another way (the seed, or
-- chats opened before enquiry history existed) have neither, so those people
-- were missing from /admin/leads. This gives each such conversation the exact
-- rows routing would have written: one lead per person, deduplicated on email
-- within the company, and one answered enquiry linked to the chat.
--
-- Safe to re-run in spirit: both statements only touch conversations that have
-- no enquiry yet, and existing leads are never overwritten.

-- 1. The people. Earliest conversation first, so the lead's createdAt is when
--    they first got in touch; the most recent details win on name and phone,
--    matching routing, where the latest submission updates the lead.
INSERT INTO "Lead" ("id", "companyId", "name", "email", "phone", "branchId", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    first."companyId",
    latest."name",
    first."email",
    latest."phone",
    latest."branchId",
    first."createdAt",
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (b."companyId", lower(v."email"))
        b."companyId", lower(v."email") AS "email", c."createdAt"
    FROM "Conversation" c
    JOIN "Visitor" v ON v."id" = c."visitorId"
    JOIN "Agent" a ON a."id" = c."agentId"
    JOIN "Branch" b ON b."id" = a."branchId"
    WHERE NOT EXISTS (SELECT 1 FROM "Enquiry" e WHERE e."conversationId" = c."id")
    ORDER BY b."companyId", lower(v."email"), c."createdAt" ASC
) AS first
JOIN LATERAL (
    SELECT v."name", v."phone", a."branchId"
    FROM "Conversation" c
    JOIN "Visitor" v ON v."id" = c."visitorId"
    JOIN "Agent" a ON a."id" = c."agentId"
    JOIN "Branch" b ON b."id" = a."branchId"
    WHERE b."companyId" = first."companyId" AND lower(v."email") = first."email"
    ORDER BY c."createdAt" DESC
    LIMIT 1
) AS latest ON TRUE
ON CONFLICT ("companyId", "email") DO NOTHING;

-- 2. The approaches. A conversation exists, so somebody answered.
INSERT INTO "Enquiry" ("id", "leadId", "branchId", "conversationId", "answered", "createdAt")
SELECT
    gen_random_uuid()::text,
    l."id",
    a."branchId",
    c."id",
    TRUE,
    c."createdAt"
FROM "Conversation" c
JOIN "Visitor" v ON v."id" = c."visitorId"
JOIN "Agent" a ON a."id" = c."agentId"
JOIN "Branch" b ON b."id" = a."branchId"
JOIN "Lead" l ON l."companyId" = b."companyId" AND l."email" = lower(v."email")
WHERE NOT EXISTS (SELECT 1 FROM "Enquiry" e WHERE e."conversationId" = c."id");
