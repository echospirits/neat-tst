-- AlterTable
ALTER TABLE "EventShift" ADD COLUMN     "accountType" "SalesAccountType",
ADD COLUMN     "attendance" INTEGER,
ADD COLUMN     "details" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "eventType" TEXT NOT NULL DEFAULT 'TASTING',
ADD COLUMN     "externalAccountId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "staffUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "submissionKey" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "LoggedVisit" ADD COLUMN     "eventShiftId" TEXT;

-- CreateTable
CREATE TABLE "EventbriteConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalOrganizationId" TEXT NOT NULL,
    "tokenEncrypted" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventbriteConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventbriteConnection_organizationId_key" ON "EventbriteConnection"("organizationId");

-- CreateIndex
CREATE INDEX "EventShift_organizationId_startsAt_idx" ON "EventShift"("organizationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventShift_organizationId_id_key" ON "EventShift"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EventShift_organizationId_submissionKey_key" ON "EventShift"("organizationId", "submissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "EventShift_organizationId_source_externalId_key" ON "EventShift"("organizationId", "source", "externalId");

-- AddForeignKey
ALTER TABLE "EventShift" ADD CONSTRAINT "EventShift_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggedVisit" ADD CONSTRAINT "LoggedVisit_organizationId_eventShiftId_fkey" FOREIGN KEY ("organizationId", "eventShiftId") REFERENCES "EventShift"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventbriteConnection" ADD CONSTRAINT "EventbriteConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

