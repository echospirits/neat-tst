-- Provider-neutral calendar connections and Worklist event links.
CREATE TYPE "CalendarProviderName" AS ENUM ('GOOGLE', 'MICROSOFT', 'APPLE');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'ERROR', 'REMOVED', 'DISABLED');

ALTER TABLE "LoggedVisit"
  ADD COLUMN "followUpTimeMinutes" INTEGER,
  ADD COLUMN "followUpAssignedToUserId" TEXT;

ALTER TABLE "WorklistItem"
  ADD COLUMN "dueTimeMinutes" INTEGER;

CREATE TABLE "CalendarConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "CalendarProviderName" NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "providerEmail" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT NOT NULL,
  "selectedCalendarId" TEXT NOT NULL,
  "selectedCalendarName" TEXT,
  "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
  "syncToken" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "syncError" TEXT,
  "requiresReconnect" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarOAuthState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "CalendarProviderName" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "returnPath" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorklistCalendarEvent" (
  "id" TEXT NOT NULL,
  "worklistItemId" TEXT NOT NULL,
  "connectionId" TEXT,
  "provider" "CalendarProviderName" NOT NULL,
  "externalEventId" TEXT,
  "calendarId" TEXT,
  "syncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
  "eventUpdatedAt" TIMESTAMP(3),
  "eventEtag" TEXT,
  "crmScheduleHash" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "syncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorklistCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarConnection_userId_provider_key" ON "CalendarConnection"("userId", "provider");
CREATE INDEX "CalendarConnection_provider_providerAccountId_idx" ON "CalendarConnection"("provider", "providerAccountId");
CREATE INDEX "CalendarConnection_provider_syncEnabled_requiresReconnect_idx" ON "CalendarConnection"("provider", "syncEnabled", "requiresReconnect");
CREATE UNIQUE INDEX "CalendarOAuthState_stateHash_key" ON "CalendarOAuthState"("stateHash");
CREATE INDEX "CalendarOAuthState_userId_provider_idx" ON "CalendarOAuthState"("userId", "provider");
CREATE INDEX "CalendarOAuthState_expiresAt_idx" ON "CalendarOAuthState"("expiresAt");
CREATE INDEX "LoggedVisit_followUpAssignedToUserId_idx" ON "LoggedVisit"("followUpAssignedToUserId");
CREATE UNIQUE INDEX "WorklistCalendarEvent_worklistItemId_provider_key" ON "WorklistCalendarEvent"("worklistItemId", "provider");
CREATE UNIQUE INDEX "WorklistCalendarEvent_provider_externalEventId_key" ON "WorklistCalendarEvent"("provider", "externalEventId");
CREATE INDEX "WorklistCalendarEvent_connectionId_idx" ON "WorklistCalendarEvent"("connectionId");
CREATE INDEX "WorklistCalendarEvent_syncStatus_idx" ON "WorklistCalendarEvent"("syncStatus");

ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarOAuthState" ADD CONSTRAINT "CalendarOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoggedVisit" ADD CONSTRAINT "LoggedVisit_followUpAssignedToUserId_fkey" FOREIGN KEY ("followUpAssignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorklistCalendarEvent" ADD CONSTRAINT "WorklistCalendarEvent_worklistItemId_fkey" FOREIGN KEY ("worklistItemId") REFERENCES "WorklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorklistCalendarEvent" ADD CONSTRAINT "WorklistCalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
