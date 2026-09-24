-- The widget now opens on a list of the person's own chats, found by the phone
-- number they type. That makes the phone the identity a visitor is known by,
-- rather than the id their browser happens to be holding: the same person on a
-- second device is the same person, and must reach the same conversations.
--
-- `Visitor` keeps one row per browser — its id is still the localStorage value —
-- but gains the normalised key that says which person that browser belongs to.
-- Normalisation is the same three steps the application and the Lead table
-- already use, so a row written by either lands on the same key.

ALTER TABLE "Visitor" ADD COLUMN "phoneKey" TEXT;

--    a) digits only
UPDATE "Visitor" SET "phoneKey" = regexp_replace("phone", '[^0-9]', '', 'g');

--    b) an international prefix written as 00 becomes bare
UPDATE "Visitor"
SET "phoneKey" = substring("phoneKey" FROM 3)
WHERE "phoneKey" LIKE '00%';

--    c) a local number gains Pakistan's country code: 0300... and bare 300...
--       both become 92300...
UPDATE "Visitor"
SET "phoneKey" = CASE
    WHEN "phoneKey" LIKE '0%' THEN '92' || substring("phoneKey" FROM 2)
    WHEN length("phoneKey") = 10 AND "phoneKey" NOT LIKE '92%' THEN '92' || "phoneKey"
    ELSE "phoneKey"
END;

--    d) a visitor with no usable digits keeps its own id as a key. This one
--       matters more than it did on Lead: the key is now what grants access to
--       a conversation, so every unidentifiable browser must be its own
--       identity rather than all of them sharing one.
UPDATE "Visitor" SET "phoneKey" = 'unknown-' || "id" WHERE "phoneKey" = '';

ALTER TABLE "Visitor" ALTER COLUMN "phoneKey" SET NOT NULL;

-- Read on every lookup from the widget, and on every access check.
CREATE INDEX "Visitor_phoneKey_idx" ON "Visitor"("phoneKey");
