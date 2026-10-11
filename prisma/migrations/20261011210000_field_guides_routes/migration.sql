-- AlterTable
ALTER TABLE "LoggedVisit" ADD COLUMN     "guidedAnswers" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "WorklistItem" ADD COLUMN     "routeOrder" INTEGER;

