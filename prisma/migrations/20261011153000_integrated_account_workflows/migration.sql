-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "crmPreferences" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "OrganizationAccountOverlay" ADD COLUMN     "salesPlan" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "salesPlanVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AccountActivity" ADD COLUMN     "contactIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "WorklistItem" ADD COLUMN     "sourceActivityId" TEXT;

-- AddForeignKey
ALTER TABLE "WorklistItem" ADD CONSTRAINT "WorklistItem_organizationId_sourceActivityId_fkey" FOREIGN KEY ("organizationId", "sourceActivityId") REFERENCES "AccountActivity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

