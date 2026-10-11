-- AlterTable
ALTER TABLE "LocationContact" ADD COLUMN     "decisionAuthority" TEXT,
ADD COLUMN     "emailAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "influenceLevel" TEXT,
ADD COLUMN     "mergedIntoContactId" TEXT,
ADD COLUMN     "personKey" TEXT,
ADD COLUMN     "preferredChannel" TEXT,
ADD COLUMN     "relationshipOwnerId" TEXT;

-- AlterTable
ALTER TABLE "MailboxConnection" ADD COLUMN     "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "internalDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastRetentionAt" TIMESTAMP(3),
ADD COLUMN     "nextRetryAt" TIMESTAMP(3);

