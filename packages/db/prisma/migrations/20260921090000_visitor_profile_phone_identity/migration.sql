-- The pre-chat form now asks for name, phone, marital status and city, and no
-- longer asks for an email address.
--
-- That moves the identity of a Lead from email to phone. Phone numbers are
-- written a dozen different ways for the same person, so the identity lives in
-- a normalised `phoneKey` (digits, country code, no punctuation) while `phone`
-- keeps whatever the visitor actually typed, which is what an admin dials.
--
-- DESTRUCTIVE: `Visitor.email` and `Lead.email` are dropped, and leads that
-- share a phone number within a company are merged into one. Take a dump first
-- (deploy/deploy.sh backup).

-- 1. The new marital-status enum. Nullable everywhere it is used: people
--    recorded before this migration were never asked, and inventing a value
--    for them would be worse than admitting we do not know.
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'SEPARATED', 'WIDOWED');

-- 2. Visitor: one browser. No dedup needed, its id is the localStorage value.
ALTER TABLE "Visitor" ADD COLUMN "maritalStatus" "MaritalStatus";
ALTER TABLE "Visitor" ADD COLUMN "city" TEXT;
DROP INDEX IF EXISTS "Visitor_email_idx";
ALTER TABLE "Visitor" DROP COLUMN "email";
CREATE INDEX "Visitor_phone_idx" ON "Visitor"("phone");

-- 3. Lead: the person. New columns first, still nullable while we backfill.
ALTER TABLE "Lead" ADD COLUMN "maritalStatus" "MaritalStatus";
ALTER TABLE "Lead" ADD COLUMN "city" TEXT;
ALTER TABLE "Lead" ADD COLUMN "phoneKey" TEXT;

-- 4. Normalise every existing number into phoneKey, in the same three steps the
--    application uses, so a row written today and a row written tomorrow land
--    on the same key.
--    a) digits only
UPDATE "Lead" SET "phoneKey" = regexp_replace("phone", '[^0-9]', '', 'g');

--    b) an international prefix written as 00 becomes bare
UPDATE "Lead"
SET "phoneKey" = substring("phoneKey" FROM 3)
WHERE "phoneKey" LIKE '00%';

--    c) a local number gains Pakistan's country code: 0300... and bare 300...
--       both become 92300...
UPDATE "Lead"
SET "phoneKey" = CASE
    WHEN "phoneKey" LIKE '0%' THEN '92' || substring("phoneKey" FROM 2)
    WHEN length("phoneKey") = 10 AND "phoneKey" NOT LIKE '92%' THEN '92' || "phoneKey"
    ELSE "phoneKey"
END;

--    d) a lead with no usable digits keeps its own id as a key, so the unique
--       index below cannot merge two people who are merely both unknown.
UPDATE "Lead" SET "phoneKey" = 'unknown-' || "id" WHERE "phoneKey" = '';

ALTER TABLE "Lead" ALTER COLUMN "phoneKey" SET NOT NULL;

-- 5. Merge leads that turn out to be the same person. The most recently updated
--    row wins, because that is the rule routing already uses when the same
--    person gets in touch again: latest details win. Their enquiry histories are
--    moved onto the survivor first, so no approach is lost in the merge.
WITH ranked AS (
    SELECT
        "id",
        first_value("id") OVER (
            PARTITION BY "companyId", "phoneKey"
            ORDER BY "updatedAt" DESC, "id" DESC
        ) AS keep_id
    FROM "Lead"
)
UPDATE "Enquiry" e
SET "leadId" = r.keep_id
FROM ranked r
WHERE e."leadId" = r."id" AND r."id" <> r.keep_id;

WITH ranked AS (
    SELECT
        "id",
        first_value("id") OVER (
            PARTITION BY "companyId", "phoneKey"
            ORDER BY "updatedAt" DESC, "id" DESC
        ) AS keep_id
    FROM "Lead"
)
DELETE FROM "Lead" l
USING ranked r
WHERE l."id" = r."id" AND r."id" <> r.keep_id;

-- 6. Swap the identity over, now that the column is unique.
DROP INDEX IF EXISTS "Lead_companyId_email_key";
ALTER TABLE "Lead" DROP COLUMN "email";
CREATE UNIQUE INDEX "Lead_companyId_phoneKey_key" ON "Lead"("companyId", "phoneKey");
CREATE INDEX "Lead_companyId_city_idx" ON "Lead"("companyId", "city");
