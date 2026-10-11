BEGIN;

ALTER TABLE "WholesaleAccount"
  ADD COLUMN "addressImportProtected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cityImportProtected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "zipImportProtected" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing differences from the stored official record. This does not
-- assert who changed them. Keep account values and geocodes exactly as they are.
UPDATE "WholesaleAccount" AS w
SET "addressImportProtected" = w.address IS DISTINCT FROM a.address,
    "cityImportProtected" = w.city IS DISTINCT FROM a.city,
    "zipImportProtected" = w.zip IS DISTINCT FROM a.zip
FROM "Account" AS a
WHERE a.id = w."officialAccountId" AND w."mergedIntoId" IS NULL;

-- Without an official link there is no source record to compare. Protect known
-- user-created account values; let future imports fill their missing fields.
UPDATE "WholesaleAccount"
SET "addressImportProtected" = address IS NOT NULL,
    "cityImportProtected" = city IS NOT NULL,
    "zipImportProtected" = zip IS NOT NULL
WHERE "officialAccountId" IS NULL AND "createdByUserId" IS NOT NULL
  AND "mergedIntoId" IS NULL;

COMMIT;
