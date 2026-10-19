-- AlterTable
ALTER TABLE "LocationContact" ADD COLUMN     "phoneAliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "AccountActivity" ADD COLUMN     "providerSeenAt" TIMESTAMP(3);
