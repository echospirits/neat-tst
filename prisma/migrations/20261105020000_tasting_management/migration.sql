-- CreateEnum
CREATE TYPE "TastingTasterResponse" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_EDIT');

-- CreateEnum
CREATE TYPE "TastingAgencyApproval" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "TastingStateApproval" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "LoggedVisit" ADD COLUMN     "tastingEventId" TEXT;

-- CreateTable
CREATE TABLE "TastingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "assignedTasterUserId" TEXT,
    "contactId" TEXT,
    "tasterNotes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "tasterResponse" "TastingTasterResponse" NOT NULL DEFAULT 'PENDING',
    "tasterRespondedAt" TIMESTAMP(3),
    "tasterRespondedByUserId" TEXT,
    "tasterResponseComment" TEXT,
    "approvedAssignment" JSONB,
    "agencyApproval" "TastingAgencyApproval" NOT NULL DEFAULT 'NOT_REQUESTED',
    "agencyRequestedAt" TIMESTAMP(3),
    "agencyRequestedByUserId" TEXT,
    "agencyDecidedAt" TIMESTAMP(3),
    "agencyDecidedByUserId" TEXT,
    "agencyDecisionComment" TEXT,
    "stateApproval" "TastingStateApproval" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "stateSubmittedAt" TIMESTAMP(3),
    "stateSubmittedByUserId" TEXT,
    "stateDecidedAt" TIMESTAMP(3),
    "stateDecidedByUserId" TEXT,
    "stateDecisionComment" TEXT,
    "stateReference" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedVisitId" TEXT,
    "emailsGathered" INTEGER,
    "postEventNotes" TEXT NOT NULL DEFAULT '',
    "tasterFeedback" TEXT NOT NULL DEFAULT '',
    "retailBottlesSold" DOUBLE PRECISION,
    "salesProductBreakdown" JSONB,
    "salesDataSource" TEXT,
    "salesCalculatedAt" TIMESTAMP(3),
    "salesSourceDataThrough" DATE,
    "salesSourceRevision" TEXT,
    "importKey" TEXT,
    "importMetadata" JSONB NOT NULL DEFAULT '{}',
    "importNeedsReview" BOOLEAN NOT NULL DEFAULT false,
    "submissionKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TastingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TastingWorkflowEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tastingEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TastingWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TastingEvent_organizationId_scheduledDate_idx" ON "TastingEvent"("organizationId", "scheduledDate");

-- CreateIndex
CREATE INDEX "TastingEvent_organizationId_agencyId_scheduledDate_idx" ON "TastingEvent"("organizationId", "agencyId", "scheduledDate");

-- CreateIndex
CREATE INDEX "TastingEvent_organizationId_assignedTasterUserId_startsAt_idx" ON "TastingEvent"("organizationId", "assignedTasterUserId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TastingEvent_organizationId_id_key" ON "TastingEvent"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TastingEvent_organizationId_importKey_key" ON "TastingEvent"("organizationId", "importKey");

-- CreateIndex
CREATE UNIQUE INDEX "TastingEvent_organizationId_submissionKey_key" ON "TastingEvent"("organizationId", "submissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "TastingEvent_organizationId_completedVisitId_key" ON "TastingEvent"("organizationId", "completedVisitId");

-- CreateIndex
CREATE INDEX "TastingWorkflowEvent_organizationId_tastingEventId_createdA_idx" ON "TastingWorkflowEvent"("organizationId", "tastingEventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_id_key" ON "User"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LocationContact_organizationId_id_key" ON "LocationContact"("organizationId", "id");

-- CreateIndex
CREATE INDEX "LoggedVisit_organizationId_tastingEventId_idx" ON "LoggedVisit"("organizationId", "tastingEventId");

-- CreateIndex
CREATE UNIQUE INDEX "LoggedVisit_organizationId_id_key" ON "LoggedVisit"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_organizationId_assignedTasterUserId_fkey" FOREIGN KEY ("organizationId", "assignedTasterUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "LocationContact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_organizationId_completedVisitId_fkey" FOREIGN KEY ("organizationId", "completedVisitId") REFERENCES "LoggedVisit"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TastingWorkflowEvent" ADD CONSTRAINT "TastingWorkflowEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TastingWorkflowEvent" ADD CONSTRAINT "TastingWorkflowEvent_organizationId_tastingEventId_fkey" FOREIGN KEY ("organizationId", "tastingEventId") REFERENCES "TastingEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggedVisit" ADD CONSTRAINT "LoggedVisit_organizationId_tastingEventId_fkey" FOREIGN KEY ("organizationId", "tastingEventId") REFERENCES "TastingEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Schedule/execution invariants are independent of the visible workflow label.
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_schedule_check"
  CHECK ("endsAt" > "startsAt" AND
    ("startsAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = "scheduledDate" AND
    ("endsAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = "scheduledDate");
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_completion_check"
  CHECK (("completedAt" IS NULL) = ("completedVisitId" IS NULL));
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_emails_check"
  CHECK ("emailsGathered" IS NULL OR "emailsGathered" >= 0);
ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_cancellation_check"
  CHECK ("cancelledAt" IS NULL OR ("cancelledByUserId" IS NOT NULL AND length(trim("cancellationReason")) > 0));

-- Explicit, stable pilot identity; no tenant-name matching and no broad TST auto-enrollment.
INSERT INTO "OrganizationFeature" ("id", "organizationId", "featureKey", "enabled", "source", "createdAt", "updatedAt")
SELECT 'tasting-management-echo-pilot', "id", 'TASTING_MANAGEMENT', true, 'pilot', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" WHERE "id" = 'org_echo_spirits'
ON CONFLICT ("organizationId", "featureKey") DO UPDATE
SET "enabled" = true, "source" = 'pilot', "updatedAt" = CURRENT_TIMESTAMP;
