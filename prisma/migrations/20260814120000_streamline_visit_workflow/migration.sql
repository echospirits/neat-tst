-- Add structured fields without removing any historical visit data.
ALTER TABLE "LoggedVisit"
  ADD COLUMN "outcomeCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "followUpMode" TEXT,
  ADD COLUMN "submissionKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "LoggedVisit_submissionKey_key" ON "LoggedVisit"("submissionKey");

-- Map the existing dated follow-ups to the legacy task behavior. Existing
-- summary, outcomes, nextStep, and contact fields remain available for history.
UPDATE "LoggedVisit"
SET "followUpMode" = CASE
  WHEN "followUpDate" IS NOT NULL THEN 'task'
  WHEN "nextStep" IS NOT NULL AND BTRIM("nextStep") <> '' THEN 'later'
  ELSE 'none'
END;
