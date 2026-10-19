-- AlterTable
ALTER TABLE "WorklistItem" ADD COLUMN     "playbookRunId" TEXT;

-- CreateTable
CREATE TABLE "SalesPlaybook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "accountType" "SalesAccountType" NOT NULL,
    "accountId" TEXT NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesPlaybook_organizationId_id_key" ON "SalesPlaybook"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPlaybook_organizationId_name_key" ON "SalesPlaybook"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_accountType_accountId_status_idx" ON "PlaybookRun"("organizationId", "accountType", "accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookRun_organizationId_id_key" ON "PlaybookRun"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookRun_organizationId_submissionKey_key" ON "PlaybookRun"("organizationId", "submissionKey");

-- AddForeignKey
ALTER TABLE "WorklistItem" ADD CONSTRAINT "WorklistItem_organizationId_playbookRunId_fkey" FOREIGN KEY ("organizationId", "playbookRunId") REFERENCES "PlaybookRun"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPlaybook" ADD CONSTRAINT "SalesPlaybook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRun" ADD CONSTRAINT "PlaybookRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRun" ADD CONSTRAINT "PlaybookRun_organizationId_playbookId_fkey" FOREIGN KEY ("organizationId", "playbookId") REFERENCES "SalesPlaybook"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

