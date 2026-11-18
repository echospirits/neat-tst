-- Additive private native-report storage; existing forecasting facts are untouched.
CREATE TABLE "OhlqBailmentReportPayload" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "csvBytes" BYTEA NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "byteCount" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "validation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OhlqBailmentReportPayload_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bailment_payload_positive_size" CHECK ("rowCount" > 0 AND "byteCount" > 0 AND "byteCount" <= 33554432 AND octet_length("csvBytes") = "byteCount")
);

CREATE TABLE "OhlqBailmentReportRetrieval" (
    "organizationId" TEXT NOT NULL,
    "retrievalId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedFrom" DATE,
    "requestedTo" DATE,
    "timezone" TEXT NOT NULL,
    "reportIdentity" TEXT NOT NULL,
    "parameterScope" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "contentHash" TEXT,
    "rowCount" INTEGER,
    "validation" JSONB NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    CONSTRAINT "OhlqBailmentReportRetrieval_pkey" PRIMARY KEY ("organizationId", "retrievalId"),
    CONSTRAINT "bailment_retrieval_outcome" CHECK ("status" IN ('SUCCEEDED', 'FAILED'))
);

CREATE TABLE "OhlqBailmentReportState" (
    "organizationId" TEXT NOT NULL,
    "currentRetrievalId" TEXT NOT NULL,
    "currentPayloadId" TEXT NOT NULL,
    "previousPayloadId" TEXT,
    CONSTRAINT "OhlqBailmentReportState_pkey" PRIMARY KEY ("organizationId"),
    CONSTRAINT "bailment_previous_distinct" CHECK ("previousPayloadId" IS NULL OR "previousPayloadId" <> "currentPayloadId")
);

CREATE UNIQUE INDEX "OhlqBailmentReportPayload_organizationId_contentHash_key" ON "OhlqBailmentReportPayload"("organizationId", "contentHash");
CREATE UNIQUE INDEX "OhlqBailmentReportPayload_organizationId_id_key" ON "OhlqBailmentReportPayload"("organizationId", "id");
CREATE INDEX "bailment_retrieval_org_requested_idx" ON "OhlqBailmentReportRetrieval"("organizationId", "requestedAt", "retrievalId");

ALTER TABLE "OhlqBailmentReportPayload" ADD CONSTRAINT "OhlqBailmentReportPayload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OhlqBailmentReportRetrieval" ADD CONSTRAINT "OhlqBailmentReportRetrieval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OhlqBailmentReportState" ADD CONSTRAINT "OhlqBailmentReportState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OhlqBailmentReportState" ADD CONSTRAINT "bailment_state_current_retrieval_fkey" FOREIGN KEY ("organizationId", "currentRetrievalId") REFERENCES "OhlqBailmentReportRetrieval"("organizationId", "retrievalId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OhlqBailmentReportState" ADD CONSTRAINT "bailment_state_current_payload_fkey" FOREIGN KEY ("organizationId", "currentPayloadId") REFERENCES "OhlqBailmentReportPayload"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OhlqBailmentReportState" ADD CONSTRAINT "bailment_state_previous_payload_fkey" FOREIGN KEY ("organizationId", "previousPayloadId") REFERENCES "OhlqBailmentReportPayload"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
