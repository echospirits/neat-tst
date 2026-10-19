-- AlterTable
ALTER TABLE "AccountActivity" ADD COLUMN     "deliveryStatus" TEXT;

-- CreateTable
CREATE TABLE "SmsConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "accountSid" TEXT,
    "sender" TEXT,
    "credentialsEncrypted" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "registrationVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsConsentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "providerId" TEXT,
    "contactId" TEXT,
    "agencyId" TEXT,
    "wholesaleAccountId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsConnection_accountSid_key" ON "SmsConnection"("accountSid");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConnection_sender_key" ON "SmsConnection"("sender");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConnection_organizationId_id_key" ON "SmsConnection"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConnection_organizationId_provider_key" ON "SmsConnection"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConsent_organizationId_phone_key" ON "SmsConsent"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "SmsConsentEvent_organizationId_phone_occurredAt_idx" ON "SmsConsentEvent"("organizationId", "phone", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConsentEvent_organizationId_eventKey_key" ON "SmsConsentEvent"("organizationId", "eventKey");

-- CreateIndex
CREATE INDEX "SmsMessage_organizationId_phone_createdAt_idx" ON "SmsMessage"("organizationId", "phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_organizationId_sourceKey_key" ON "SmsMessage"("organizationId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_connectionId_providerId_key" ON "SmsMessage"("connectionId", "providerId");

-- AddForeignKey
ALTER TABLE "SmsConnection" ADD CONSTRAINT "SmsConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsConsent" ADD CONSTRAINT "SmsConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsConsentEvent" ADD CONSTRAINT "SmsConsentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "SmsConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

