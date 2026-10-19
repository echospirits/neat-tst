BEGIN;

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('BUG', 'DATA', 'ENHANCEMENT', 'QUESTION');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'PLANNED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "anticipatedFixDate" DATE,
    "diagnostics" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "responseVersion" INTEGER NOT NULL DEFAULT 0,
    "reporterReadVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "isPlatformReply" BOOLEAN NOT NULL DEFAULT false,
    "status" "SupportStatus",
    "anticipatedFixDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportScreenshot" (
    "ticketId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportScreenshot_pkey" PRIMARY KEY ("ticketId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_requestId_key" ON "SupportTicket"("requestId");

-- CreateIndex
CREATE INDEX "SupportTicket_organizationId_status_createdAt_idx" ON "SupportTicket"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_reporterId_createdAt_idx" ON "SupportTicket"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_createdAt_idx" ON "SupportTicket"("status", "priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_requestId_key" ON "SupportMessage"("requestId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportScreenshot" ADD CONSTRAINT "SupportScreenshot_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce the storage boundary even for writes outside the application.
ALTER TABLE "SupportScreenshot" ADD CONSTRAINT "SupportScreenshot_small_raster_check"
CHECK (octet_length("bytes") BETWEEN 1 AND 614400 AND "contentType" IN ('image/jpeg', 'image/png', 'image/webp'));

COMMIT;
