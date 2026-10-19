-- Additive only. Existing values remain historical; no score/20 conversion.
ALTER TYPE "OpportunityType" ADD VALUE IF NOT EXISTS 'COMMERCIAL_FOLLOW_UP';
ALTER TABLE "WholesaleAccountAssessment"
  ADD COLUMN "rating" INTEGER,
  ADD COLUMN "assessmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "assessmentReason" TEXT;
ALTER TABLE "WholesaleAccountAssessment" ADD CONSTRAINT "WholesaleAccountAssessment_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 0 AND 5);
ALTER TABLE "WholesaleAssessmentRun" ADD COLUMN "skipped" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "WholesaleAccountAssessment_organizationId_rating_idx" ON "WholesaleAccountAssessment"("organizationId", "rating");
CREATE INDEX "WholesaleAccountAssessment_organizationId_assessmentStatus_r_idx" ON "WholesaleAccountAssessment"("organizationId", "assessmentStatus", "rating");

CREATE TABLE "WholesaleAssessmentSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "wholesaleAccountId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "configurationId" TEXT NOT NULL,
  "asOfDate" DATE NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL,
  "rating" INTEGER,
  "assessmentStatus" TEXT NOT NULL,
  "assessmentReason" TEXT,
  "assessment" JSONB NOT NULL,
  CONSTRAINT "WholesaleAssessmentSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WholesaleAssessmentSnapshot_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 0 AND 5)
);
CREATE UNIQUE INDEX "WholesaleAssessmentSnapshot_runId_wholesaleAccountId_key" ON "WholesaleAssessmentSnapshot"("runId", "wholesaleAccountId");
CREATE INDEX "WholesaleAssessmentSnapshot_organizationId_wholesaleAccountI_idx" ON "WholesaleAssessmentSnapshot"("organizationId", "wholesaleAccountId", "calculatedAt");

-- Preserve the replaced model's actual last result for audit/comparison only.
INSERT INTO "WholesaleAssessmentSnapshot" ("id", "organizationId", "wholesaleAccountId", "runId", "modelVersion", "configurationId", "asOfDate", "calculatedAt", "rating", "assessmentStatus", "assessmentReason", "assessment")
SELECT 'legacy:' || "id", "organizationId", "wholesaleAccountId", "runId", "modelVersion", "configurationId", "asOfDate", "calculatedAt", NULL, 'LEGACY', 'Historical assessment before commercial-star model; not a current commercial rating.', "assessment"
FROM "WholesaleAccountAssessment";
