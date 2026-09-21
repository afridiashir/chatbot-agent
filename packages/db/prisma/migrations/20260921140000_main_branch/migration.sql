-- One branch per company is the "main" one: where a chat goes when nothing
-- named a branch. The pre-chat form no longer asks the visitor to pick, so
-- every chat that does not arrive through an agent link or a branch link lands
-- here.

ALTER TABLE "Branch" ADD COLUMN "isMain" BOOLEAN NOT NULL DEFAULT false;

-- Every existing company gets one, so no deployment is left with nowhere to
-- route to. The oldest active branch is the closest thing to "the main office"
-- that the data already knows; an admin can move the flag afterwards.
UPDATE "Branch" b
SET "isMain" = true
WHERE b."id" = (
    SELECT inner_b."id"
    FROM "Branch" inner_b
    WHERE inner_b."companyId" = b."companyId" AND inner_b."isActive"
    ORDER BY inner_b."createdAt" ASC, inner_b."id" ASC
    LIMIT 1
);

-- A company with no active branch at all falls back to its oldest branch of
-- any kind, rather than being left without a main branch.
UPDATE "Branch" b
SET "isMain" = true
WHERE NOT EXISTS (
    SELECT 1 FROM "Branch" m WHERE m."companyId" = b."companyId" AND m."isMain"
)
AND b."id" = (
    SELECT inner_b."id"
    FROM "Branch" inner_b
    WHERE inner_b."companyId" = b."companyId"
    ORDER BY inner_b."createdAt" ASC, inner_b."id" ASC
    LIMIT 1
);

-- "At most one per company", enforced by the database rather than by whichever
-- code path happens to write the flag. Partial, so the many `false` rows do not
-- collide with each other.
CREATE UNIQUE INDEX "Branch_companyId_isMain_key" ON "Branch"("companyId") WHERE "isMain";
