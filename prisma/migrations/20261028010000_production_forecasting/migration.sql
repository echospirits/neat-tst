-- CreateTable
CREATE TABLE "ProductionSourceImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "coverageStart" DATE NOT NULL,
    "coverageEnd" DATE NOT NULL,
    "observedOn" DATE NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "excludedRows" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL,

    CONSTRAINT "ProductionSourceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDemandObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "availableOn" DATE NOT NULL,
    "cases" DECIMAL(14,4) NOT NULL,
    "classification" TEXT NOT NULL,
    "transactionStatus" TEXT NOT NULL,
    "sourceEvidence" JSONB,

    CONSTRAINT "ProductionDemandObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionGuidanceObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "observedOn" DATE NOT NULL,
    "minimum" DECIMAL(14,4),
    "maximum" DECIMAL(14,4),
    "classification" TEXT NOT NULL,
    "sourceEvidence" JSONB,

    CONSTRAINT "ProductionGuidanceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionForecastRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizonStart" DATE NOT NULL,
    "horizonEnd" DATE NOT NULL,
    "dataThrough" DATE,
    "modelVersion" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "sourceSummary" JSONB NOT NULL,

    CONSTRAINT "ProductionForecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionForecastSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "horizonStart" DATE NOT NULL,
    "horizonEnd" DATE NOT NULL,
    "point" DECIMAL(14,4),
    "lower" DECIMAL(14,4),
    "upper" DECIMAL(14,4),
    "target" DECIMAL(14,4),
    "confidence" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "detail" JSONB NOT NULL,
    "actualCases" DECIMAL(14,4),
    "actualEvaluatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionSourceImport_organizationId_market_source_status__idx" ON "ProductionSourceImport"("organizationId", "market", "source", "status", "coverageEnd");

-- CreateIndex
CREATE INDEX "ProductionSourceImport_organizationId_importedAt_idx" ON "ProductionSourceImport"("organizationId", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionSourceImport_organizationId_market_source_content_key" ON "ProductionSourceImport"("organizationId", "market", "source", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionSourceImport_organizationId_id_key" ON "ProductionSourceImport"("organizationId", "id");

-- CreateIndex
CREATE INDEX "production_demand_product_date_idx" ON "ProductionDemandObservation"("organizationId", "market", "itemCode", "date");

-- CreateIndex
CREATE INDEX "production_demand_location_date_idx" ON "ProductionDemandObservation"("organizationId", "market", "itemCode", "locationCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionDemandObservation_organizationId_importId_sourceL_key" ON "ProductionDemandObservation"("organizationId", "importId", "sourceLineId");

-- CreateIndex
CREATE INDEX "ProductionGuidanceObservation_organizationId_market_itemCod_idx" ON "ProductionGuidanceObservation"("organizationId", "market", "itemCode", "observedOn");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionGuidanceObservation_organizationId_importId_itemC_key" ON "ProductionGuidanceObservation"("organizationId", "importId", "itemCode", "locationCode");

-- CreateIndex
CREATE INDEX "ProductionForecastRun_organizationId_generatedAt_idx" ON "ProductionForecastRun"("organizationId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionForecastRun_organizationId_runKey_key" ON "ProductionForecastRun"("organizationId", "runKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionForecastRun_organizationId_id_key" ON "ProductionForecastRun"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductionForecastSnapshot_organizationId_productId_horizon_idx" ON "ProductionForecastSnapshot"("organizationId", "productId", "horizonStart");

-- CreateIndex
CREATE INDEX "ProductionForecastSnapshot_organizationId_horizonEnd_actual_idx" ON "ProductionForecastSnapshot"("organizationId", "horizonEnd", "actualEvaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionForecastSnapshot_organizationId_runId_productId_key" ON "ProductionForecastSnapshot"("organizationId", "runId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationProduct_organizationId_id_key" ON "OrganizationProduct"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "ProductionSourceImport" ADD CONSTRAINT "ProductionSourceImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDemandObservation" ADD CONSTRAINT "ProductionDemandObservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDemandObservation" ADD CONSTRAINT "ProductionDemandObservation_organizationId_importId_fkey" FOREIGN KEY ("organizationId", "importId") REFERENCES "ProductionSourceImport"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDemandObservation" ADD CONSTRAINT "ProductionDemandObservation_organizationId_market_itemCode_fkey" FOREIGN KEY ("organizationId", "market", "itemCode") REFERENCES "OrganizationProduct"("organizationId", "market", "externalItemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionGuidanceObservation" ADD CONSTRAINT "ProductionGuidanceObservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionGuidanceObservation" ADD CONSTRAINT "ProductionGuidanceObservation_organizationId_importId_fkey" FOREIGN KEY ("organizationId", "importId") REFERENCES "ProductionSourceImport"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionGuidanceObservation" ADD CONSTRAINT "ProductionGuidanceObservation_organizationId_market_itemCo_fkey" FOREIGN KEY ("organizationId", "market", "itemCode") REFERENCES "OrganizationProduct"("organizationId", "market", "externalItemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionForecastRun" ADD CONSTRAINT "ProductionForecastRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionForecastSnapshot" ADD CONSTRAINT "ProductionForecastSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionForecastSnapshot" ADD CONSTRAINT "ProductionForecastSnapshot_organizationId_runId_fkey" FOREIGN KEY ("organizationId", "runId") REFERENCES "ProductionForecastRun"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionForecastSnapshot" ADD CONSTRAINT "ProductionForecastSnapshot_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "OrganizationProduct"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate normalized quantities, classifications and coverage at the boundary.
ALTER TABLE "ProductionSourceImport" ADD CONSTRAINT "production_import_coverage_check" CHECK ("coverageStart" <= "coverageEnd" AND "coverageEnd" <= "observedOn" AND "status" IN ('COMPLETE','FAILED','INCOMPLETE') AND "source" IN ('BAILMENT_PO_INVOICE','DISTRIBUTION_CENTER'));
ALTER TABLE "ProductionDemandObservation" ADD CONSTRAINT "production_demand_values_check" CHECK ("cases" >= 0 AND "availableOn" >= "date" AND "classification" IN ('BAILMENT','A3A_BAIL','A3A_DIST','OTHER_OUTBOUND') AND "transactionStatus" IN ('POSTED','SHIPPED','CANCELLED'));
ALTER TABLE "ProductionGuidanceObservation" ADD CONSTRAINT "production_guidance_values_check" CHECK (("minimum" IS NULL OR "minimum" >= 0) AND ("maximum" IS NULL OR "maximum" >= 0) AND ("minimum" IS NULL OR "maximum" IS NULL OR "minimum" <= "maximum") AND "classification" IN ('BAILMENT','A3A_BAIL','A3A_DIST','OTHER_OUTBOUND'));
ALTER TABLE "ProductionForecastSnapshot" ADD CONSTRAINT "production_forecast_values_check" CHECK ("horizonEnd" = "horizonStart" + 29 AND ("point" IS NULL OR ("point" >= 0 AND "lower" >= 0 AND "lower" <= "point" AND "upper" >= "point" AND "target" >= "point")));

-- Explicit tenant enrollment, never organization-name matching. Preserve choices
-- on a controlled replay. The existing TST broad override excludes pilot keys.
INSERT INTO "OrganizationFeature" ("id","organizationId","featureKey","enabled","source","createdAt","updatedAt")
SELECT 'production_forecast_pilot_' || md5(o."id"), o."id", 'PRODUCTION_FORECASTING', o."id" = 'org_echo_spirits', 'production-forecast-pilot', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
ON CONFLICT ("organizationId","featureKey") DO NOTHING;
