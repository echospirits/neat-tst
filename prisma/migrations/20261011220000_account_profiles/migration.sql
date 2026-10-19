-- AlterTable
ALTER TABLE "OrganizationAccountOverlay" ADD COLUMN     "crmDetails" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "crmDetailsVersion" INTEGER NOT NULL DEFAULT 0;

