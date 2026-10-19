ALTER TABLE "AccountActivity" ADD COLUMN "participantNames" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "ContactSuggestionReview" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "identityKey" TEXT NOT NULL, "status" TEXT NOT NULL, "contactId" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ContactSuggestionReview_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ContactSuggestionReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ContactSuggestionReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContactSuggestionReview_organizationId_userId_identityKey_key" ON "ContactSuggestionReview"("organizationId", "userId", "identityKey");
