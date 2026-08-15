ALTER TYPE "WorklistSource" ADD VALUE IF NOT EXISTS 'OPPORTUNITY_INTELLIGENCE';
CREATE TYPE "OpportunityType" AS ENUM ('LAPSED_BUYER','FIRST_ORDER_FOLLOW_UP','CATEGORY_CONQUEST','CROSS_SELL','NO_RECENT_TOUCH');
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN','ACTIONED','SNOOZED','DISMISSED','CONVERTED','RESOLVED','EXPIRED');
CREATE TYPE "OpportunityEventType" AS ENUM ('DETECTED','SHOWN','ASSIGNED','WORKLIST_CREATED','OPENED','VISIT_LOGGED','ACTIONED','SNOOZED','DISMISSED','PURCHASE_DETECTED','CONVERTED','RESOLVED','EXPIRED');
CREATE TYPE "OpportunityRankingMode" AS ENUM ('ACTIVE','SHADOW');

CREATE TABLE "OpportunityAccountSignal" (
  "id" TEXT NOT NULL, "wholesaleAccountId" TEXT NOT NULL, "asOfDate" DATE NOT NULL,
  "signalVersion" TEXT NOT NULL, "features" JSONB NOT NULL, "firstEchoPurchaseAt" DATE,
  "lastEchoPurchaseAt" DATE, "historyComplete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpportunityAccountSignal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountSalesEvent" (
  "id" TEXT NOT NULL, "wholesaleAccountId" TEXT NOT NULL, "reportDate" DATE NOT NULL,
  "agencyId" TEXT NOT NULL, "vendor" TEXT NOT NULL, "itemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL, "category" TEXT, "bottles" INTEGER NOT NULL,
  "annualBottlesAfter" INTEGER NOT NULL, "isTenantProduct" BOOLEAN NOT NULL,
  "sourceKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountSalesEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpportunityModelVersion" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "version" TEXT NOT NULL,
  "opportunityType" "OpportunityType", "mode" "OpportunityRankingMode" NOT NULL DEFAULT 'ACTIVE',
  "configuration" JSONB NOT NULL, "evaluation" JSONB, "activatedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityModelVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalesOpportunity" (
  "id" TEXT NOT NULL, "wholesaleAccountId" TEXT NOT NULL, "type" "OpportunityType" NOT NULL,
  "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN', "cycleKey" TEXT NOT NULL,
  "targetCategory" TEXT, "title" TEXT NOT NULL, "recommendedAction" TEXT NOT NULL,
  "explanation" JSONB NOT NULL, "signalSnapshot" JSONB NOT NULL, "rulesVersion" TEXT NOT NULL,
  "scoringVersion" TEXT NOT NULL, "productionScore" DOUBLE PRECISION NOT NULL,
  "priorityBand" TEXT NOT NULL, "assignedToUserId" TEXT, "detectedAt" TIMESTAMP(3) NOT NULL,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL, "shownAt" TIMESTAMP(3), "actionedAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3), "dismissedAt" TIMESTAMP(3), "dismissalReason" TEXT,
  "convertedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3), "expiredAt" TIMESTAMP(3),
  "conversionPurchaseAt" DATE, "conversionVisitId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesOpportunity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpportunityEvent" (
  "id" TEXT NOT NULL, "opportunityId" TEXT NOT NULL, "eventType" "OpportunityEventType" NOT NULL,
  "eventKey" TEXT NOT NULL, "wholesaleAccountId" TEXT NOT NULL, "userId" TEXT,
  "loggedVisitId" TEXT, "worklistItemId" TEXT, "purchaseReportDate" DATE,
  "metadata" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpportunityScore" (
  "id" TEXT NOT NULL, "opportunityId" TEXT NOT NULL, "modelVersionId" TEXT NOT NULL,
  "mode" "OpportunityRankingMode" NOT NULL, "score" DOUBLE PRECISION NOT NULL,
  "priorityBand" TEXT NOT NULL, "factors" JSONB NOT NULL,
  "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityScore_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WorklistItem" ADD COLUMN "salesOpportunityId" TEXT;

CREATE UNIQUE INDEX "OpportunityAccountSignal_wholesaleAccountId_key" ON "OpportunityAccountSignal"("wholesaleAccountId");
CREATE INDEX "OpportunityAccountSignal_asOfDate_idx" ON "OpportunityAccountSignal"("asOfDate");
CREATE INDEX "OpportunityAccountSignal_lastEchoPurchaseAt_idx" ON "OpportunityAccountSignal"("lastEchoPurchaseAt");
CREATE UNIQUE INDEX "AccountSalesEvent_sourceKey_key" ON "AccountSalesEvent"("sourceKey");
CREATE INDEX "AccountSalesEvent_wholesaleAccountId_reportDate_idx" ON "AccountSalesEvent"("wholesaleAccountId","reportDate");
CREATE INDEX "AccountSalesEvent_reportDate_idx" ON "AccountSalesEvent"("reportDate");
CREATE INDEX "AccountSalesEvent_vendor_reportDate_idx" ON "AccountSalesEvent"("vendor","reportDate");
CREATE INDEX "AccountSalesEvent_itemCode_reportDate_idx" ON "AccountSalesEvent"("itemCode","reportDate");
CREATE INDEX "AccountSalesEvent_category_reportDate_idx" ON "AccountSalesEvent"("category","reportDate");
CREATE INDEX "AccountSalesEvent_isTenantProduct_reportDate_idx" ON "AccountSalesEvent"("isTenantProduct","reportDate");
CREATE UNIQUE INDEX "OpportunityModelVersion_name_version_opportunityType_mode_key" ON "OpportunityModelVersion"("name","version","opportunityType","mode");
CREATE INDEX "OpportunityModelVersion_opportunityType_mode_activatedAt_idx" ON "OpportunityModelVersion"("opportunityType","mode","activatedAt");
CREATE UNIQUE INDEX "SalesOpportunity_wholesaleAccountId_type_cycleKey_key" ON "SalesOpportunity"("wholesaleAccountId","type","cycleKey");
CREATE INDEX "SalesOpportunity_wholesaleAccountId_status_idx" ON "SalesOpportunity"("wholesaleAccountId","status");
CREATE INDEX "SalesOpportunity_type_status_productionScore_idx" ON "SalesOpportunity"("type","status","productionScore");
CREATE INDEX "SalesOpportunity_status_detectedAt_idx" ON "SalesOpportunity"("status","detectedAt");
CREATE INDEX "SalesOpportunity_assignedToUserId_status_idx" ON "SalesOpportunity"("assignedToUserId","status");
CREATE INDEX "SalesOpportunity_scoringVersion_idx" ON "SalesOpportunity"("scoringVersion");
CREATE UNIQUE INDEX "OpportunityEvent_opportunityId_eventKey_key" ON "OpportunityEvent"("opportunityId","eventKey");
CREATE INDEX "OpportunityEvent_wholesaleAccountId_occurredAt_idx" ON "OpportunityEvent"("wholesaleAccountId","occurredAt");
CREATE INDEX "OpportunityEvent_eventType_occurredAt_idx" ON "OpportunityEvent"("eventType","occurredAt");
CREATE INDEX "OpportunityEvent_userId_occurredAt_idx" ON "OpportunityEvent"("userId","occurredAt");
CREATE INDEX "OpportunityEvent_loggedVisitId_idx" ON "OpportunityEvent"("loggedVisitId");
CREATE INDEX "OpportunityEvent_worklistItemId_idx" ON "OpportunityEvent"("worklistItemId");
CREATE INDEX "OpportunityEvent_purchaseReportDate_idx" ON "OpportunityEvent"("purchaseReportDate");
CREATE UNIQUE INDEX "OpportunityScore_opportunityId_modelVersionId_key" ON "OpportunityScore"("opportunityId","modelVersionId");
CREATE INDEX "OpportunityScore_mode_score_idx" ON "OpportunityScore"("mode","score");
CREATE INDEX "OpportunityScore_scoredAt_idx" ON "OpportunityScore"("scoredAt");
CREATE INDEX "WorklistItem_salesOpportunityId_idx" ON "WorklistItem"("salesOpportunityId");

ALTER TABLE "OpportunityAccountSignal" ADD CONSTRAINT "OpportunityAccountSignal_wholesaleAccountId_fkey" FOREIGN KEY ("wholesaleAccountId") REFERENCES "WholesaleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountSalesEvent" ADD CONSTRAINT "AccountSalesEvent_wholesaleAccountId_fkey" FOREIGN KEY ("wholesaleAccountId") REFERENCES "WholesaleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOpportunity" ADD CONSTRAINT "SalesOpportunity_wholesaleAccountId_fkey" FOREIGN KEY ("wholesaleAccountId") REFERENCES "WholesaleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityEvent" ADD CONSTRAINT "OpportunityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityScore" ADD CONSTRAINT "OpportunityScore_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityScore" ADD CONSTRAINT "OpportunityScore_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "OpportunityModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorklistItem" ADD CONSTRAINT "WorklistItem_salesOpportunityId_fkey" FOREIGN KEY ("salesOpportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
