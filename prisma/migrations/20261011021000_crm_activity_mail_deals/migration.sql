-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountActivityType" ADD VALUE 'EMAIL';
ALTER TYPE "AccountActivityType" ADD VALUE 'SMS';
ALTER TYPE "AccountActivityType" ADD VALUE 'PHONE_CALL';
ALTER TYPE "AccountActivityType" ADD VALUE 'VIRTUAL_MEETING';
ALTER TYPE "AccountActivityType" ADD VALUE 'CALENDAR_MEETING';
ALTER TYPE "AccountActivityType" ADD VALUE 'INTERNAL_NOTE';
ALTER TYPE "AccountActivityType" ADD VALUE 'CUSTOMER_INTERACTION';
ALTER TYPE "AccountActivityType" ADD VALUE 'SAMPLE_DELIVERY';
ALTER TYPE "AccountActivityType" ADD VALUE 'TASTING';
ALTER TYPE "AccountActivityType" ADD VALUE 'TRAINING';
ALTER TYPE "AccountActivityType" ADD VALUE 'SALES_PRESENTATION';
ALTER TYPE "AccountActivityType" ADD VALUE 'MENU_PLACEMENT';
ALTER TYPE "AccountActivityType" ADD VALUE 'MERCHANDISING';
ALTER TYPE "AccountActivityType" ADD VALUE 'SYSTEM_EVENT';

-- AlterTable
ALTER TABLE "AccountActivity" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "matchConfidence" DOUBLE PRECISION,
ADD COLUMN     "matchStatus" TEXT NOT NULL DEFAULT 'MATCHED',
ADD COLUMN     "meaningful" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "threadId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'TEAM',
ALTER COLUMN "contactId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "historyDays" INTEGER NOT NULL DEFAULT 30,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "excludeInternal" BOOLEAN NOT NULL DEFAULT true,
    "cursor" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxOAuthState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "verifierEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailboxOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DealStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agencyId" TEXT,
    "wholesaleAccountId" TEXT,
    "contactId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revenueCents" INTEGER,
    "volume" DOUBLE PRECISION,
    "probability" INTEGER NOT NULL,
    "expectedCloseAt" TIMESTAMP(3),
    "targetProducts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextAction" TEXT,
    "competitors" TEXT,
    "objections" TEXT,
    "notes" TEXT,
    "submissionKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailboxConnection_enabled_leaseUntil_idx" ON "MailboxConnection"("enabled", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_organizationId_id_key" ON "MailboxConnection"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_organizationId_userId_provider_key" ON "MailboxConnection"("organizationId", "userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxOAuthState_stateHash_key" ON "MailboxOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "MailboxOAuthState_expiresAt_idx" ON "MailboxOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "ActivityAudit_organizationId_activityId_createdAt_idx" ON "ActivityAudit"("organizationId", "activityId", "createdAt");

-- CreateIndex
CREATE INDEX "DealStage_organizationId_position_idx" ON "DealStage"("organizationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DealStage_organizationId_id_key" ON "DealStage"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DealStage_organizationId_name_key" ON "DealStage"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Deal_organizationId_status_stageId_idx" ON "Deal"("organizationId", "status", "stageId");

-- CreateIndex
CREATE INDEX "Deal_organizationId_agencyId_idx" ON "Deal"("organizationId", "agencyId");

-- CreateIndex
CREATE INDEX "Deal_organizationId_wholesaleAccountId_idx" ON "Deal"("organizationId", "wholesaleAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_organizationId_id_key" ON "Deal"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_organizationId_submissionKey_key" ON "Deal"("organizationId", "submissionKey");

-- CreateIndex
CREATE INDEX "DealEvent_organizationId_dealId_occurredAt_idx" ON "DealEvent"("organizationId", "dealId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountActivity_organizationId_createdByUserId_visibility_o_idx" ON "AccountActivity"("organizationId", "createdByUserId", "visibility", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountActivity_organizationId_connectionId_threadId_idx" ON "AccountActivity"("organizationId", "connectionId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountActivity_organizationId_sourceKey_key" ON "AccountActivity"("organizationId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountActivity_organizationId_id_key" ON "AccountActivity"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "AccountActivity" ADD CONSTRAINT "AccountActivity_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "MailboxConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxOAuthState" ADD CONSTRAINT "MailboxOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxOAuthState" ADD CONSTRAINT "MailboxOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAudit" ADD CONSTRAINT "ActivityAudit_organizationId_activityId_fkey" FOREIGN KEY ("organizationId", "activityId") REFERENCES "AccountActivity"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStage" ADD CONSTRAINT "DealStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_stageId_fkey" FOREIGN KEY ("organizationId", "stageId") REFERENCES "DealStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_organizationId_dealId_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
